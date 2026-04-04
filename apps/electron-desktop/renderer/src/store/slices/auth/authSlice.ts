/**
 * Redux slice for desktop auth state and mode-switching.
 * Central source of truth for: setup mode (paid vs self-managed), JWT,
 * user info, balance, deployment, subscription, and backup/restore logic.
 */
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import {
  backendApi,
  type DesktopStatusResponse,
  type UpdateAutoTopUpPayload,
} from "@ipc/backendApi";
import { reloadConfig } from "../configSlice";
import type { GatewayRequest } from "../chat/chatSlice";
import type { AuthRefreshReason, AuthSliceState, ConfigSnapshot } from "./auth-types";
import { DEFAULT_AUTO_TOP_UP_SETTINGS } from "./auth-types";
import {
  clearPaidBackup,
  clearPersistedAuthToken,
  persistAuthToken,
  persistMode,
  readPersistedAuthToken,
  readPersistedMode,
} from "./auth-persistence";
import {
  extractModel,
  getBaseHash,
  normalizeAutoTopUpSettings,
  resetAuthFields,
} from "./auth-slice-helpers";

export type { SetupMode, AutoTopUpState, AuthSliceState, AuthRefreshReason } from "./auth-types";
export { persistMode } from "./auth-persistence";

const initialState: AuthSliceState = {
  mode: null,
  jwt: null,
  email: null,
  userId: null,
  balance: null,
  deployment: null,
  subscription: null,
  loading: false,
  error: null,
  lastRefreshAt: null,
  refreshInFlight: false,
  refreshError: null,
  nextAllowedAt: null,
  refreshFailureCount: 0,
  topUpPending: false,
  topUpError: null,
  balancePolling: false,
  autoTopUp: { ...DEFAULT_AUTO_TOP_UP_SETTINGS },
  autoTopUpLoading: false,
  autoTopUpSaving: false,
  autoTopUpError: null,
  autoTopUpLoaded: false,
};

// ── Thunks ────────────────────────────────────────────────────

/**
 * Restore mode + JWT from localStorage on app startup.
 */
export const restoreMode = createAsyncThunk("auth/restoreMode", async (_: void, thunkApi) => {
  const token = readPersistedAuthToken();
  const persistedMode = readPersistedMode();

  if (token) {
    thunkApi.dispatch(authActions.setMode("paid"));
    thunkApi.dispatch(authActions.setAuth(token));
    persistMode("paid");
    return;
  }

  if (persistedMode) {
    thunkApi.dispatch(authActions.setMode(persistedMode));
  }
});

export const storeAuthToken = createAsyncThunk(
  "auth/storeToken",
  async (params: { jwt: string; email: string; userId: string; isNewUser: boolean }) => {
    persistAuthToken({ jwt: params.jwt, email: params.email, userId: params.userId });
    return params;
  }
);

export const clearAuth = createAsyncThunk("auth/clear", async () => {
  clearPersistedAuthToken();
});

const SUBSCRIPTION_DEFAULT_MODEL = "openrouter/anthropic/claude-sonnet-4.6";

/**
 * Apply subscription keys from the backend after Google auth.
 * Fetches OpenRouter key, writes it via IPC, sets up auth profile in gateway config.
 * When no model is configured (e.g. login from settings, not onboarding),
 * defaults to Claude Sonnet 4.6 via OpenRouter.
 */
export const applySubscriptionKeys = createAsyncThunk(
  "auth/applySubscriptionKeys",
  async ({ token, request }: { token: string; request: GatewayRequest }, thunkApi) => {
    const api = getDesktopApiOrNull();

    const keys = await backendApi.getKeys(token);
    if (keys.openrouterApiKey && api?.setApiKey) {
      await api.setApiKey("openrouter", keys.openrouterApiKey);
    }
    if (keys.openaiApiKey && api?.setApiKey) {
      await api.setApiKey("openai", keys.openaiApiKey);
    }

    const snap = await request<ConfigSnapshot>("config.get", {});
    const baseHash = getBaseHash(snap);
    if (baseHash) {
      const profileId = "openrouter:default";

      const cfg = (snap.config && typeof snap.config === "object" ? snap.config : {}) as Record<
        string,
        unknown
      >;
      const currentModel = extractModel(cfg);
      const hasModel = !!currentModel.primary;

      const profiles: Record<string, { provider: string; mode: "api_key" }> = {
        [profileId]: { provider: "openrouter", mode: "api_key" },
      };
      const order: Record<string, string[]> = { openrouter: [profileId] };

      if (keys.openaiApiKey) {
        profiles["openai:default"] = { provider: "openai", mode: "api_key" };
        order.openai = ["openai:default"];
      }

      const patch: Record<string, unknown> = {
        auth: {
          profiles,
          order,
        },
      };

      if (!hasModel) {
        patch.agents = {
          defaults: {
            model: { primary: SUBSCRIPTION_DEFAULT_MODEL },
            models: { [SUBSCRIPTION_DEFAULT_MODEL]: {} },
          },
        };
      }

      await request("config.patch", {
        baseHash,
        raw: JSON.stringify(patch, null, 2),
        note: "Subscription login: apply backend-provided OpenRouter key",
      });
    }

    await thunkApi.dispatch(reloadConfig({ request }));
  }
);

/**
 * Log out: clear auth token and paid backup, reset gateway config,
 * stay in paid mode (shows login UI).
 */
export const handleLogout = createAsyncThunk(
  "auth/handleLogout",
  async ({ request }: { request: GatewayRequest }, thunkApi) => {
    const api = getDesktopApiOrNull();

    clearPaidBackup();

    if (api?.authWriteProfiles) {
      try {
        await api.authWriteProfiles({ profiles: {}, order: {} });
      } catch (err) {
        console.warn("[authSlice] Failed to clear auth profiles on logout:", err);
      }
    }

    try {
      const snap = await request<ConfigSnapshot>("config.get", {});
      const baseHash = getBaseHash(snap);
      if (baseHash) {
        await request("config.patch", {
          baseHash,
          raw: JSON.stringify(
            {
              auth: { profiles: null, order: null },
              agents: { defaults: { model: { primary: "" } } },
            },
            null,
            2
          ),
          note: "Logout: clear auth config",
        });
      }
    } catch (err) {
      console.warn("[authSlice] Failed to clear config on logout:", err);
    }

    await thunkApi.dispatch(clearAuth()).unwrap();

    thunkApi.dispatch(authActions.setMode("paid"));
    persistMode("paid");

    await thunkApi.dispatch(reloadConfig({ request }));
  }
);

export const fetchDesktopStatus = createAsyncThunk(
  "auth/fetchStatus",
  async (_: void, thunkApi) => {
    const state = thunkApi.getState() as { auth: AuthSliceState };
    const { jwt } = state.auth;
    if (!jwt) throw new Error("Not authenticated");

    return backendApi.getStatus(jwt);
  }
);

export const fetchBalance = createAsyncThunk("auth/fetchBalance", async (_: void, thunkApi) => {
  const state = thunkApi.getState() as { auth: AuthSliceState };
  const { jwt } = state.auth;
  if (!jwt) throw new Error("Not authenticated");

  return backendApi.getBalance(jwt, true);
});

export const createAddonCheckout = createAsyncThunk(
  "auth/createAddonCheckout",
  async (params: { amountUsd: number }, thunkApi) => {
    const state = thunkApi.getState() as { auth: AuthSliceState };
    const { jwt } = state.auth;
    if (!jwt) throw new Error("Not authenticated");

    return backendApi.createAddonCheckout(jwt, {
      amountUsd: params.amountUsd,
      successUrl: "atomicbot://addon-success",
      cancelUrl: "atomicbot://addon-cancel",
    });
  }
);

export const fetchAutoTopUpSettings = createAsyncThunk(
  "auth/fetchAutoTopUpSettings",
  async (_: void, thunkApi) => {
    const state = thunkApi.getState() as { auth: AuthSliceState };
    const { jwt } = state.auth;
    if (!jwt) throw new Error("Not authenticated");

    return backendApi.getAutoTopUpSettings(jwt);
  }
);

export const patchAutoTopUpSettings = createAsyncThunk(
  "auth/patchAutoTopUpSettings",
  async (patch: UpdateAutoTopUpPayload, thunkApi) => {
    const state = thunkApi.getState() as { auth: AuthSliceState };
    const { jwt, autoTopUp } = state.auth;
    if (!jwt) throw new Error("Not authenticated");

    const payload: UpdateAutoTopUpPayload = {
      enabled: patch.enabled ?? autoTopUp.enabled,
      thresholdUsd: patch.thresholdUsd ?? autoTopUp.thresholdUsd,
      topupAmountUsd: patch.topupAmountUsd ?? autoTopUp.topupAmountUsd,
      monthlyCapUsd:
        patch.monthlyCapUsd !== undefined ? patch.monthlyCapUsd : autoTopUp.monthlyCapUsd,
    };

    return backendApi.updateAutoTopUpSettings(jwt, payload);
  },
  {
    condition: (_patch, thunkApi) => {
      const state = thunkApi.getState() as { auth: AuthSliceState };
      return !state.auth.autoTopUpSaving;
    },
  }
);

// ── Slice ─────────────────────────────────────────────────────

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setMode(state, action: PayloadAction<AuthSliceState["mode"]>) {
      state.mode = action.payload;
    },
    setAuth(state, action: PayloadAction<{ jwt: string; email: string; userId: string }>) {
      state.jwt = action.payload.jwt;
      state.email = action.payload.email;
      state.userId = action.payload.userId;
      state.error = null;
    },
    setBalance(
      state,
      action: PayloadAction<{ remaining: number; limit: number; usage: number } | null>
    ) {
      state.balance = action.payload;
    },
    clearAuthState(state) {
      resetAuthFields(state);
    },
    requestBackgroundRefresh(_state, _action: PayloadAction<{ reason: AuthRefreshReason }>) {
      // reducer is intentionally empty; handled by listener middleware
    },
    appFocused(_state) {
      // reducer is intentionally empty; handled by listener middleware
    },
    appVisible(_state) {
      // reducer is intentionally empty; handled by listener middleware
    },
    markRefreshStarted(state) {
      state.refreshInFlight = true;
    },
    markRefreshSucceeded(state, action: PayloadAction<{ at: number; nextAllowedAt: number }>) {
      state.refreshInFlight = false;
      state.lastRefreshAt = action.payload.at;
      state.nextAllowedAt = action.payload.nextAllowedAt;
      state.refreshError = null;
      state.refreshFailureCount = 0;
    },
    markRefreshFailed(state, action: PayloadAction<{ message: string; nextAllowedAt: number }>) {
      state.refreshInFlight = false;
      state.refreshError = action.payload.message;
      state.nextAllowedAt = action.payload.nextAllowedAt;
      state.refreshFailureCount += 1;
    },
    setBalancePolling(state, action: PayloadAction<boolean>) {
      state.balancePolling = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(storeAuthToken.fulfilled, (state, action) => {
        state.jwt = action.payload.jwt;
        state.email = action.payload.email;
        state.userId = action.payload.userId;
        state.mode = "paid";
        state.error = null;
      })
      .addCase(clearAuth.fulfilled, (state) => {
        resetAuthFields(state);
      })
      .addCase(fetchDesktopStatus.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchDesktopStatus.fulfilled, (state, action) => {
        state.loading = false;
        state.refreshInFlight = false;
        const resp = action.payload as DesktopStatusResponse;
        if (
          resp.balance &&
          typeof resp.balance.remaining === "number" &&
          typeof resp.balance.limit === "number"
        ) {
          state.balance = {
            remaining: resp.balance.remaining,
            limit: resp.balance.limit,
            usage: resp.balance.usage ?? 0,
          };
        }
        state.deployment = resp.deployment ?? null;
        state.subscription = resp.subscription ?? null;
      })
      .addCase(fetchDesktopStatus.rejected, (state, action) => {
        state.loading = false;
        state.refreshInFlight = false;
        const message = action.error.message ?? "Failed to fetch status";
        state.error = message;
        state.refreshError = message;
      })
      .addCase(fetchBalance.fulfilled, (state, action) => {
        const resp = action.payload;
        if (typeof resp.remaining === "number" && typeof resp.limit === "number") {
          state.balance = {
            remaining: resp.remaining,
            limit: resp.limit,
            usage: resp.usage ?? 0,
          };
        }
      })
      .addCase(createAddonCheckout.pending, (state) => {
        state.topUpPending = true;
        state.topUpError = null;
      })
      .addCase(createAddonCheckout.fulfilled, (state) => {
        state.topUpPending = false;
      })
      .addCase(createAddonCheckout.rejected, (state, action) => {
        state.topUpPending = false;
        state.topUpError = action.error.message ?? "Failed to create top-up checkout";
      })
      .addCase(fetchAutoTopUpSettings.pending, (state) => {
        state.autoTopUpLoading = true;
        state.autoTopUpError = null;
      })
      .addCase(fetchAutoTopUpSettings.fulfilled, (state, action) => {
        state.autoTopUpLoading = false;
        state.autoTopUpLoaded = true;
        state.autoTopUp = normalizeAutoTopUpSettings(action.payload);
      })
      .addCase(fetchAutoTopUpSettings.rejected, (state, action) => {
        state.autoTopUpLoading = false;
        state.autoTopUpLoaded = true;
        state.autoTopUp = normalizeAutoTopUpSettings(null);
        state.autoTopUpError = action.error.message ?? "Failed to fetch auto top-up settings";
      })
      .addCase(patchAutoTopUpSettings.pending, (state) => {
        state.autoTopUpSaving = true;
        state.autoTopUpError = null;
      })
      .addCase(patchAutoTopUpSettings.fulfilled, (state, action) => {
        state.autoTopUpSaving = false;
        state.autoTopUpLoaded = true;
        state.autoTopUp = normalizeAutoTopUpSettings(action.payload);
      })
      .addCase(patchAutoTopUpSettings.rejected, (state, action) => {
        state.autoTopUpSaving = false;
        state.autoTopUpError = action.error.message ?? "Failed to save auto top-up settings";
      });
  },
});

export const authActions = authSlice.actions;
export const authReducer = authSlice.reducer;
