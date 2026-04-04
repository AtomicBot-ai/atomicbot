import type { AutoTopUpSettingsResponse } from "@ipc/backendApi";
import type { AuthSliceState, AutoTopUpState } from "./auth-types";
import { DEFAULT_AUTO_TOP_UP_SETTINGS } from "./auth-types";

export function extractAuth(cfg: Record<string, unknown>) {
  const auth =
    cfg.auth && typeof cfg.auth === "object" && !Array.isArray(cfg.auth)
      ? (cfg.auth as Record<string, unknown>)
      : {};
  return {
    profiles: auth.profiles as Record<string, unknown> | undefined,
    order: auth.order as Record<string, unknown> | undefined,
  };
}

export function extractModel(cfg: Record<string, unknown>) {
  const agents =
    cfg.agents && typeof cfg.agents === "object" ? (cfg.agents as Record<string, unknown>) : {};
  const defaults =
    agents.defaults && typeof agents.defaults === "object"
      ? (agents.defaults as Record<string, unknown>)
      : {};
  const model =
    defaults.model && typeof defaults.model === "object"
      ? (defaults.model as Record<string, unknown>)
      : {};
  return {
    primary: typeof model.primary === "string" ? model.primary : undefined,
    models: defaults.models as Record<string, unknown> | undefined,
  };
}

export function getBaseHash(snap: { hash?: string }): string | null {
  return typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
}

export function normalizeAutoTopUpSettings(
  raw?: Partial<AutoTopUpSettingsResponse> | null
): AutoTopUpState {
  return {
    enabled: raw?.enabled ?? DEFAULT_AUTO_TOP_UP_SETTINGS.enabled,
    thresholdUsd: raw?.thresholdUsd ?? DEFAULT_AUTO_TOP_UP_SETTINGS.thresholdUsd,
    topupAmountUsd: raw?.topupAmountUsd ?? DEFAULT_AUTO_TOP_UP_SETTINGS.topupAmountUsd,
    monthlyCapUsd:
      raw?.monthlyCapUsd !== undefined
        ? raw.monthlyCapUsd
        : DEFAULT_AUTO_TOP_UP_SETTINGS.monthlyCapUsd,
    hasPaymentMethod: raw?.hasPaymentMethod ?? DEFAULT_AUTO_TOP_UP_SETTINGS.hasPaymentMethod,
    currentMonthSpentUsd:
      raw?.currentMonthSpentUsd ?? DEFAULT_AUTO_TOP_UP_SETTINGS.currentMonthSpentUsd,
  };
}

/**
 * Reset all auth-related fields to initial values.
 * Shared by both `clearAuthState` reducer and `clearAuth.fulfilled` extraReducer
 * to eliminate duplication and ensure parity.
 */
export function resetAuthFields(state: AuthSliceState): void {
  state.jwt = null;
  state.email = null;
  state.userId = null;
  state.balance = null;
  state.deployment = null;
  state.subscription = null;
  state.error = null;
  state.lastRefreshAt = null;
  state.refreshInFlight = false;
  state.refreshError = null;
  state.nextAllowedAt = null;
  state.refreshFailureCount = 0;
  state.topUpPending = false;
  state.topUpError = null;
  state.balancePolling = false;
  state.autoTopUp = { ...DEFAULT_AUTO_TOP_UP_SETTINGS };
  state.autoTopUpLoading = false;
  state.autoTopUpSaving = false;
  state.autoTopUpError = null;
  state.autoTopUpLoaded = false;
}
