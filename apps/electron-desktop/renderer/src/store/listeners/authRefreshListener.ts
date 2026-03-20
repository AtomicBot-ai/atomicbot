import { createListenerMiddleware, isAnyOf, type TypedStartListening } from "@reduxjs/toolkit";
import type { UnknownAction } from "@reduxjs/toolkit";
import type { Dispatch } from "redux";
import {
  authActions,
  clearAuth,
  fetchAutoTopUpSettings,
  fetchDesktopStatus,
  restoreMode,
  storeAuthToken,
  type AuthSliceState,
} from "../slices/auth/authSlice";

const REFRESH_INTERVAL_MS = 15_000;
const REFRESH_COOLDOWN_MS = 15_000;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 120_000;

type RootLikeState = { auth: AuthSliceState };
type ListenerDispatch = Dispatch<UnknownAction>;
type StartListening = TypedStartListening<RootLikeState, ListenerDispatch>;

type IntervalHandle = ReturnType<typeof setInterval>;

let refreshIntervalHandle: IntervalHandle | null = null;
let listenersStarted = false;

function isPaidAuthenticated(auth: AuthSliceState): boolean {
  return auth.mode === "paid" && typeof auth.jwt === "string" && auth.jwt.length > 0;
}

function stopRefreshInterval(): void {
  if (refreshIntervalHandle === null) return;
  clearInterval(refreshIntervalHandle);
  refreshIntervalHandle = null;
}

function ensureRefreshInterval(listenerApi: { dispatch: (action: UnknownAction) => void }): void {
  if (refreshIntervalHandle !== null) return;
  refreshIntervalHandle = setInterval(() => {
    listenerApi.dispatch(authActions.requestBackgroundRefresh({ reason: "interval" }));
  }, REFRESH_INTERVAL_MS);
}

function computeBackoffMs(failureCount: number): number {
  const power = Math.max(0, failureCount);
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** power);
}

function extractErrorMessage(result: unknown): string {
  if (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof result.error === "object" &&
    result.error !== null &&
    "message" in result.error &&
    typeof result.error.message === "string"
  ) {
    return result.error.message;
  }
  return "Failed to refresh status";
}

async function runRefresh(listenerApi: {
  dispatch: (action: UnknownAction) => unknown;
  getState: () => RootLikeState;
}): Promise<void> {
  const current = listenerApi.getState().auth;
  if (!isPaidAuthenticated(current)) {
    return;
  }
  if (current.refreshInFlight) {
    return;
  }

  const now = Date.now();
  if (typeof current.nextAllowedAt === "number" && current.nextAllowedAt > now) {
    return;
  }

  listenerApi.dispatch(authActions.markRefreshStarted());
  try {
    const result = await (listenerApi.dispatch as (action: unknown) => Promise<UnknownAction>)(
      fetchDesktopStatus()
    );
    if (!fetchDesktopStatus.fulfilled.match(result)) {
      const message = extractErrorMessage(result);
      throw new Error(message);
    }
    const completedAt = Date.now();
    listenerApi.dispatch(
      authActions.markRefreshSucceeded({
        at: completedAt,
        nextAllowedAt: completedAt + REFRESH_COOLDOWN_MS,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failureCount = listenerApi.getState().auth.refreshFailureCount;
    const nextAllowedAt = Date.now() + computeBackoffMs(failureCount);
    listenerApi.dispatch(authActions.markRefreshFailed({ message, nextAllowedAt }));
  }
}

function registerLifecycleListener(startListening: StartListening): void {
  startListening({
    matcher: isAnyOf(
      authActions.setMode,
      authActions.setAuth,
      authActions.clearAuthState,
      storeAuthToken.fulfilled,
      clearAuth.fulfilled,
      restoreMode.fulfilled
    ),
    effect: async (_action, listenerApi) => {
      const auth = listenerApi.getState().auth;
      if (!isPaidAuthenticated(auth)) {
        stopRefreshInterval();
        return;
      }
      if (!auth.autoTopUpLoaded && !auth.autoTopUpLoading) {
        void (listenerApi.dispatch as (action: unknown) => Promise<UnknownAction>)(
          fetchAutoTopUpSettings()
        );
      }
      ensureRefreshInterval(listenerApi);
      listenerApi.dispatch(authActions.requestBackgroundRefresh({ reason: "immediate" }));
    },
  });
}

function registerTriggerListeners(startListening: StartListening): void {
  startListening({
    actionCreator: authActions.requestBackgroundRefresh,
    effect: async (_action, listenerApi) => {
      await runRefresh(listenerApi);
    },
  });

  startListening({
    actionCreator: authActions.appFocused,
    effect: async (_action, listenerApi) => {
      listenerApi.dispatch(authActions.requestBackgroundRefresh({ reason: "focus" }));
    },
  });

  startListening({
    actionCreator: authActions.appVisible,
    effect: async (_action, listenerApi) => {
      listenerApi.dispatch(authActions.requestBackgroundRefresh({ reason: "visibility" }));
    },
  });
}

export const authRefreshListenerMiddleware = createListenerMiddleware<RootLikeState>();

export function setupAuthRefreshListeners(): void {
  if (listenersStarted) {
    return;
  }
  listenersStarted = true;

  const startListening = authRefreshListenerMiddleware.startListening as StartListening;
  registerLifecycleListener(startListening);
  registerTriggerListeners(startListening);
}

export function resetAuthRefreshListenerForTests(): void {
  stopRefreshInterval();
  listenersStarted = false;
}
