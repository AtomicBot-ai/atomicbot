import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { DESKTOP_API_UNAVAILABLE, getDesktopApiOrNull } from "@ipc/desktopApi";
import { debugError, debugLog, debugWarn } from "@lib/debug-log";
import { errorToMessage } from "@lib/error-format";
import type { GatewayRequest } from "./chat/chat-types";

export const WARMUP_SESSION_KEY_PREFIX = "__warmup__";
let warmupRoundCounter = 0;
export function nextWarmupSessionKey(): string {
  return `${WARMUP_SESSION_KEY_PREFIX}${++warmupRoundCounter}`;
}

export type LlamacppModelInfo = {
  id: string;
  name: string;
  description: string;
  sizeLabel: string;
  contextLabel: string;
  downloaded: boolean;
  size: number;
  compatibility: string;
  icon: string;
  tag?: string;
};

export type LlamacppSystemInfo = {
  totalRamGb: number;
  arch: string;
  platform: string;
  isAppleSilicon: boolean;
};

export type LlamacppDownloadStatus =
  | { kind: "idle" }
  | { kind: "downloading"; percent: number }
  | { kind: "done" }
  | { kind: "error"; message: string };

export type LlamacppModelDownloadStatus =
  | { kind: "idle" }
  | { kind: "downloading"; modelId: string; percent: number }
  | { kind: "error"; message: string };

export type LlamacppServerStatus = "stopped" | "starting" | "loading" | "running" | "error";
export type LlamacppWarmupStatus = "idle" | "warming" | "ready" | "error";

export type LlamacppSliceState = {
  backendDownloaded: boolean;
  backendVersion: string | null;
  backendDownload: LlamacppDownloadStatus;
  modelDownload: LlamacppModelDownloadStatus;
  serverStatus: LlamacppServerStatus;
  activeModelId: string | null;
  systemInfo: LlamacppSystemInfo | null;
  models: LlamacppModelInfo[];
  warmupStatus: LlamacppWarmupStatus;
  warmupSessionKey: string | null;
  modelSwitchInFlight: boolean;
};

const initialState: LlamacppSliceState = {
  backendDownloaded: false,
  backendVersion: null,
  backendDownload: { kind: "idle" },
  modelDownload: { kind: "idle" },
  serverStatus: "stopped",
  activeModelId: null,
  systemInfo: null,
  models: [],
  warmupStatus: "idle",
  warmupSessionKey: null,
  modelSwitchInFlight: false,
};

export const fetchLlamacppSystemInfo = createAsyncThunk("llamacpp/fetchSystemInfo", async () => {
  const api = getDesktopApiOrNull();
  if (!api?.llamacppSystemInfo) return null;
  return api.llamacppSystemInfo();
});

export const fetchLlamacppBackendStatus = createAsyncThunk(
  "llamacpp/fetchBackendStatus",
  async () => {
    const api = getDesktopApiOrNull();
    if (!api?.llamacppBackendStatus) return null;
    return api.llamacppBackendStatus();
  }
);

export const checkLlamacppBackendUpdate = createAsyncThunk(
  "llamacpp/checkBackendUpdate",
  async () => {
    const api = getDesktopApiOrNull();
    if (!api?.llamacppBackendUpdate) return null;
    const result = await api.llamacppBackendUpdate();
    if (!result.ok) return null;
    return { updateAvailable: result.updateAvailable ?? false, latestTag: result.latestTag };
  }
);

export const fetchLlamacppModels = createAsyncThunk("llamacpp/fetchModels", async () => {
  const api = getDesktopApiOrNull();
  if (!api?.llamacppModelsList) return [];
  return api.llamacppModelsList();
});

export const fetchLlamacppServerStatus = createAsyncThunk(
  "llamacpp/fetchServerStatus",
  async () => {
    const api = getDesktopApiOrNull();
    if (!api?.llamacppServerStatus) return null;
    return api.llamacppServerStatus();
  }
);

export const downloadLlamacppBackend = createAsyncThunk(
  "llamacpp/downloadBackend",
  async (_, thunkApi) => {
    const api = getDesktopApiOrNull();
    if (!api?.llamacppBackendDownload) {
      return thunkApi.rejectWithValue(DESKTOP_API_UNAVAILABLE);
    }

    thunkApi.dispatch(llamacppActions.setBackendDownload({ kind: "downloading", percent: 0 }));

    const unsub = api.onLlamacppBackendDownloadProgress?.((payload) => {
      thunkApi.dispatch(
        llamacppActions.setBackendDownload({ kind: "downloading", percent: payload.percent })
      );
    });

    try {
      const result = await api.llamacppBackendDownload();
      unsub?.();
      if (!result.ok) {
        return thunkApi.rejectWithValue(result.error ?? "Download failed");
      }
      thunkApi.dispatch(fetchLlamacppBackendStatus());
      return result.tag;
    } catch (err) {
      unsub?.();
      return thunkApi.rejectWithValue(errorToMessage(err));
    }
  }
);

export const cancelLlamacppBackendDownload = createAsyncThunk(
  "llamacpp/cancelBackendDownload",
  async (_, thunkApi) => {
    const api = getDesktopApiOrNull();
    await api?.llamacppBackendDownloadCancel?.();
    thunkApi.dispatch(llamacppActions.setBackendDownload({ kind: "idle" }));
  }
);

export const downloadLlamacppModel = createAsyncThunk(
  "llamacpp/downloadModel",
  async (modelId: string, thunkApi) => {
    debugLog("llamacpp", "downloadModel starting:", modelId);
    const api = getDesktopApiOrNull();
    if (!api?.llamacppModelDownload) {
      return thunkApi.rejectWithValue(DESKTOP_API_UNAVAILABLE);
    }

    thunkApi.dispatch(
      llamacppActions.setModelDownload({ kind: "downloading", modelId, percent: 0 })
    );

    const unsub = api.onLlamacppModelDownloadProgress?.((payload) => {
      thunkApi.dispatch(
        llamacppActions.setModelDownload({
          kind: "downloading",
          modelId: payload.modelId,
          percent: payload.percent,
        })
      );
    });

    try {
      const result = await api.llamacppModelDownload({ model: modelId });
      unsub?.();
      if (!result.ok) {
        debugError("llamacpp", "downloadModel failed:", result.error);
        return thunkApi.rejectWithValue(result.error ?? "Download failed");
      }
      debugLog("llamacpp", "downloadModel done:", modelId);
      thunkApi.dispatch(fetchLlamacppModels());
      return modelId;
    } catch (err) {
      unsub?.();
      debugError("llamacpp", "downloadModel exception:", err);
      return thunkApi.rejectWithValue(errorToMessage(err));
    }
  }
);

export const cancelLlamacppModelDownload = createAsyncThunk(
  "llamacpp/cancelModelDownload",
  async (_, thunkApi) => {
    const api = getDesktopApiOrNull();
    await api?.llamacppModelDownloadCancel?.();
    thunkApi.dispatch(llamacppActions.setModelDownload({ kind: "idle" }));
  }
);

export const deleteLlamacppModel = createAsyncThunk(
  "llamacpp/deleteModel",
  async (modelId: string, thunkApi) => {
    const api = getDesktopApiOrNull();
    if (!api?.llamacppModelDelete) {
      return thunkApi.rejectWithValue(DESKTOP_API_UNAVAILABLE);
    }
    const result = await api.llamacppModelDelete({ model: modelId });
    if (!result.ok) {
      return thunkApi.rejectWithValue(result.error ?? "Delete failed");
    }
    thunkApi.dispatch(fetchLlamacppModels());
    thunkApi.dispatch(fetchLlamacppServerStatus());
    return modelId;
  }
);

export const startLlamacppServer = createAsyncThunk(
  "llamacpp/startServer",
  async (modelId: string | undefined, thunkApi) => {
    debugLog("llamacpp", "startServer requested, modelId:", modelId ?? "default");
    const api = getDesktopApiOrNull();
    if (!api?.llamacppServerStart) {
      debugError("llamacpp", "startServer:", DESKTOP_API_UNAVAILABLE);
      return thunkApi.rejectWithValue(DESKTOP_API_UNAVAILABLE);
    }

    thunkApi.dispatch(llamacppActions.setServerStatus("starting"));

    try {
      const result = await api.llamacppServerStart(modelId ? { model: modelId } : undefined);
      if (!result.ok) {
        debugError("llamacpp", "startServer failed:", result.error);
        thunkApi.dispatch(llamacppActions.setServerStatus("error"));
        return thunkApi.rejectWithValue(result.error ?? "Server start failed");
      }
      debugLog("llamacpp", "startServer OK, modelId:", result.modelId);
      return result;
    } catch (err) {
      debugError("llamacpp", "startServer exception:", err);
      thunkApi.dispatch(llamacppActions.setServerStatus("error"));
      return thunkApi.rejectWithValue(errorToMessage(err));
    }
  }
);

export const stopLlamacppServer = createAsyncThunk("llamacpp/stopServer", async (_, thunkApi) => {
  debugLog("llamacpp", "stopServer requested");
  const api = getDesktopApiOrNull();
  if (!api?.llamacppServerStop) {
    return thunkApi.rejectWithValue(DESKTOP_API_UNAVAILABLE);
  }
  const result = await api.llamacppServerStop();
  if (!result.ok) {
    debugError("llamacpp", "stopServer failed:", result.error);
    return thunkApi.rejectWithValue(result.error ?? "Stop failed");
  }
  debugLog("llamacpp", "stopServer OK");
  return true;
});

export const setLlamacppActiveModel = createAsyncThunk(
  "llamacpp/setActiveModel",
  async (modelId: string, thunkApi) => {
    debugLog("llamacpp", "setActiveModel requested:", modelId);
    const api = getDesktopApiOrNull();
    if (!api?.llamacppSetActiveModel) {
      debugError("llamacpp", "setActiveModel:", DESKTOP_API_UNAVAILABLE);
      return thunkApi.rejectWithValue(DESKTOP_API_UNAVAILABLE);
    }

    thunkApi.dispatch(llamacppActions.setServerStatus("starting"));
    thunkApi.dispatch(llamacppActions.setActiveModelId(modelId));

    // Reset main-process warmup state so the new model gets a fresh warmup
    void api.llamacppWarmupSet?.({ state: "idle", modelId: null });

    try {
      const result = await api.llamacppSetActiveModel({ model: modelId });
      if (!result.ok) {
        debugError("llamacpp", "setActiveModel failed:", result.error);
        thunkApi.dispatch(llamacppActions.setServerStatus("error"));
        return thunkApi.rejectWithValue(result.error ?? "Failed to set model");
      }
      debugLog("llamacpp", "setActiveModel OK, modelId:", result.modelId);
      return result;
    } catch (err) {
      debugError("llamacpp", "setActiveModel exception:", err);
      thunkApi.dispatch(llamacppActions.setServerStatus("error"));
      return thunkApi.rejectWithValue(errorToMessage(err));
    }
  }
);

export const warmupLocalModel = createAsyncThunk(
  "llamacpp/warmup",
  async (request: GatewayRequest, thunkApi) => {
    const sessionKey = nextWarmupSessionKey();
    debugLog("llamacpp", "warmup starting KV cache warmup, key:", sessionKey);
    thunkApi.dispatch(llamacppActions.setWarmupStatus("warming"));

    try {
      const res = await request<{ key: string }>("sessions.create", {
        key: sessionKey,
        message: "warmup",
      });
      const canonicalKey = res?.key ?? sessionKey;
      debugLog("llamacpp", "warmup session created, canonical key:", canonicalKey);
      return canonicalKey;
    } catch (err) {
      debugWarn("llamacpp", "warmup failed to create session:", err);
      return thunkApi.rejectWithValue(errorToMessage(err));
    }
  }
);

const llamacppSlice = createSlice({
  name: "llamacpp",
  initialState,
  reducers: {
    setBackendDownload(state, action: PayloadAction<LlamacppDownloadStatus>) {
      state.backendDownload = action.payload;
    },
    setModelDownload(state, action: PayloadAction<LlamacppModelDownloadStatus>) {
      state.modelDownload = action.payload;
    },
    setServerStatus(state, action: PayloadAction<LlamacppServerStatus>) {
      state.serverStatus = action.payload;
    },
    setActiveModelId(state, action: PayloadAction<string | null>) {
      state.activeModelId = action.payload;
    },
    setWarmupStatus(state, action: PayloadAction<LlamacppWarmupStatus>) {
      state.warmupStatus = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchLlamacppSystemInfo.fulfilled, (state, action) => {
      if (action.payload) {
        state.systemInfo = {
          totalRamGb: action.payload.totalRamGb,
          arch: action.payload.arch,
          platform: action.payload.platform,
          isAppleSilicon: action.payload.isAppleSilicon,
        };
      }
    });

    builder.addCase(fetchLlamacppBackendStatus.fulfilled, (state, action) => {
      if (action.payload) {
        state.backendDownloaded = action.payload.downloaded;
        state.backendVersion = action.payload.version;
      }
    });

    builder.addCase(fetchLlamacppModels.fulfilled, (state, action) => {
      state.models = action.payload;
    });

    builder.addCase(fetchLlamacppServerStatus.fulfilled, (state, action) => {
      if (action.payload) {
        if (state.modelSwitchInFlight) {
          state.activeModelId = action.payload.activeModelId;
          return;
        }
        if (action.payload.healthy) {
          state.serverStatus = "running";
        } else if (action.payload.loading) {
          state.serverStatus = "loading";
        } else if (action.payload.running) {
          state.serverStatus = "starting";
        } else {
          state.serverStatus = "stopped";
        }
        state.activeModelId = action.payload.activeModelId;
      }
    });

    builder.addCase(downloadLlamacppBackend.fulfilled, (state) => {
      state.backendDownload = { kind: "done" };
      state.backendDownloaded = true;
    });
    builder.addCase(downloadLlamacppBackend.rejected, (state, action) => {
      const msg = String(action.payload ?? action.error.message);
      if (msg === "cancelled") {
        state.backendDownload = { kind: "idle" };
        return;
      }
      state.backendDownload = { kind: "error", message: msg };
    });

    builder.addCase(downloadLlamacppModel.fulfilled, (state) => {
      state.modelDownload = { kind: "idle" };
    });
    builder.addCase(downloadLlamacppModel.rejected, (state, action) => {
      const msg = String(action.payload ?? action.error.message);
      if (msg === "cancelled") {
        state.modelDownload = { kind: "idle" };
        return;
      }
      state.modelDownload = { kind: "error", message: msg };
    });

    builder.addCase(startLlamacppServer.pending, (state) => {
      state.modelSwitchInFlight = true;
    });
    builder.addCase(startLlamacppServer.fulfilled, (state, action) => {
      state.modelSwitchInFlight = false;
      state.serverStatus = "running";
      if (action.payload?.modelId) {
        state.activeModelId = action.payload.modelId;
      }
    });
    builder.addCase(startLlamacppServer.rejected, (state) => {
      state.modelSwitchInFlight = false;
    });

    builder.addCase(stopLlamacppServer.fulfilled, (state) => {
      state.serverStatus = "stopped";
      state.warmupStatus = "idle";
      state.warmupSessionKey = null;
    });

    builder.addCase(setLlamacppActiveModel.pending, (state) => {
      state.modelSwitchInFlight = true;
    });
    builder.addCase(setLlamacppActiveModel.fulfilled, (state, action) => {
      state.modelSwitchInFlight = false;
      state.serverStatus = "running";
      state.warmupStatus = "idle";
      state.warmupSessionKey = null;
      if (action.payload?.modelId) {
        state.activeModelId = action.payload.modelId;
      }
    });
    builder.addCase(setLlamacppActiveModel.rejected, (state) => {
      state.modelSwitchInFlight = false;
    });

    builder.addCase(warmupLocalModel.fulfilled, (state, action) => {
      state.warmupSessionKey = action.payload ?? null;
    });
    builder.addCase(warmupLocalModel.rejected, (state) => {
      state.warmupStatus = "error";
      state.warmupSessionKey = null;
    });
  },
});

export const llamacppActions = llamacppSlice.actions;
export const llamacppReducer = llamacppSlice.reducer;
