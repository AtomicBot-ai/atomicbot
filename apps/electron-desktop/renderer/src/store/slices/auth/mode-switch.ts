/**
 * Unified mode-switching orchestrator.
 * Each mode (paid, self-managed, local-model) implements ModeHandler
 * with symmetric saveBackup / teardown / setup phases.
 *
 * Consumers should dispatch `switchMode` instead of the removed
 * `switchToSubscription`, `switchToSelfManaged`, `switchToLocalModel`.
 */
import { createAsyncThunk } from "@reduxjs/toolkit";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import type { DesktopApi } from "@ipc/desktopApi";
import { debugLog, debugWarn } from "@lib/debug-log";
import type { GatewayRequest } from "../chat/chatSlice";
import type { SetupMode } from "./auth-types";
import type { AppDispatch, RootState } from "../../store";
import { clearPersistedAuthToken, persistAuthToken, persistMode } from "./auth-persistence";
import { authActions } from "./authSlice";
import { reloadConfig } from "../configSlice";
import { paidHandler } from "./mode-handler-paid";
import { selfManagedHandler } from "./mode-handler-self-managed";
import { localModelHandler } from "./mode-handler-local-model";
import { resetSessionModelSelection } from "../session-model-reset";

// ── Types ──

export type SwitchContext = {
  request: GatewayRequest;
  api: DesktopApi | null;
  dispatch: AppDispatch;
  getState: () => RootState;
  extra: SwitchModeExtra;
};

export type SwitchModeExtra = {
  modelId?: string;
  modelName?: string;
  contextLength?: number;
};

export type ModeSetupResult = {
  hasBackup?: boolean;
  restoredModel?: string | null;
  restoredAuth?: { jwt: string; email: string; userId: string } | null;
};

export interface ModeHandler {
  saveBackup(ctx: SwitchContext): Promise<void>;
  teardown(ctx: SwitchContext): Promise<void>;
  setup(ctx: SwitchContext): Promise<ModeSetupResult>;
}

// ── Handler registry ──

const handlers: Record<SetupMode, ModeHandler> = {
  paid: paidHandler,
  "self-managed": selfManagedHandler,
  "local-model": localModelHandler,
};

// ── Thunk ──

export type SwitchModeParams = {
  request: GatewayRequest;
  target: SetupMode;
} & SwitchModeExtra;

export const switchMode = createAsyncThunk(
  "auth/switchMode",
  async ({ request, target, ...extra }: SwitchModeParams, thunkApi) => {
    const getState = thunkApi.getState as () => RootState;
    const dispatch = thunkApi.dispatch as AppDispatch;
    const current = getState().auth.mode;

    debugLog("mode-switch", `${current ?? "null"} → ${target}`, extra);

    if (current === target) {
      debugLog("mode-switch", "same mode, skipping");
      return { hasBackup: true } as ModeSetupResult;
    }

    const api = getDesktopApiOrNull();
    const ctx: SwitchContext = { request, api, dispatch, getState, extra };

    // Phase 1 + 2: save backup & teardown current mode
    if (current) {
      debugLog("mode-switch", `phase 1: saveBackup(${current})`);
      await handlers[current].saveBackup(ctx);
      debugLog("mode-switch", `phase 2: teardown(${current})`);
      await handlers[current].teardown(ctx);
    }

    // Common inter-mode cleanup
    clearPersistedAuthToken();
    dispatch(authActions.clearAuthState());

    // Phase 3: setup target mode
    debugLog("mode-switch", `phase 3: setup(${target})`);
    const result = await handlers[target].setup(ctx);
    debugLog("mode-switch", "setup result:", result);

    // Phase 4: finalize
    dispatch(authActions.setMode(target));
    persistMode(target);

    if (result.restoredAuth) {
      dispatch(authActions.setAuth(result.restoredAuth));
      persistAuthToken(result.restoredAuth);
    }

    try {
      await request("secrets.reload", {});
      debugLog("mode-switch", "secrets.reload OK");
    } catch (err) {
      debugWarn("mode-switch", "secrets.reload failed:", err);
    }

    debugLog("mode-switch", "resetting session model selection");
    await resetSessionModelSelection(request);
    await dispatch(reloadConfig({ request }));

    debugLog("mode-switch", `done: ${current ?? "null"} → ${target}`);
    return result;
  }
);
