import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { errorToMessage } from "../../ui/shared/toast";
import type { GatewayRequest } from "./chat/chatSlice";

export const WARMUP_SESSION_KEY = "__warmup__";

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

export type LlamacppServerStatus = "stopped" | "starting" | "running" | "error";
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
      return thunkApi.rejectWithValue("Desktop API not available");
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
    console.log("[llamacpp/downloadModel] starting:", modelId);
    const api = getDesktopApiOrNull();
    if (!api?.llamacppModelDownload) {
      return thunkApi.rejectWithValue("Desktop API not available");
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
        console.error("[llamacpp/downloadModel] failed:", result.error);
        return thunkApi.rejectWithValue(result.error ?? "Download failed");
      }
      console.log("[llamacpp/downloadModel] done:", modelId);
      thunkApi.dispatch(fetchLlamacppModels());
      return modelId;
    } catch (err) {
      unsub?.();
      console.error("[llamacpp/downloadModel] exception:", err);
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
      return thunkApi.rejectWithValue("Desktop API not available");
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
    console.log("[llamacpp/startServer] requested, modelId:", modelId ?? "default");
    const api = getDesktopApiOrNull();
    if (!api?.llamacppServerStart) {
      console.error("[llamacpp/startServer] Desktop API not available");
      return thunkApi.rejectWithValue("Desktop API not available");
    }

    thunkApi.dispatch(llamacppActions.setServerStatus("starting"));

    try {
      const result = await api.llamacppServerStart(modelId ? { model: modelId } : undefined);
      if (!result.ok) {
        console.error("[llamacpp/startServer] failed:", result.error);
        thunkApi.dispatch(llamacppActions.setServerStatus("error"));
        return thunkApi.rejectWithValue(result.error ?? "Server start failed");
      }
      console.log("[llamacpp/startServer] OK, modelId:", result.modelId);
      return result;
    } catch (err) {
      console.error("[llamacpp/startServer] exception:", err);
      thunkApi.dispatch(llamacppActions.setServerStatus("error"));
      return thunkApi.rejectWithValue(errorToMessage(err));
    }
  }
);

export const stopLlamacppServer = createAsyncThunk("llamacpp/stopServer", async (_, thunkApi) => {
  console.log("[llamacpp/stopServer] requested");
  const api = getDesktopApiOrNull();
  if (!api?.llamacppServerStop) {
    return thunkApi.rejectWithValue("Desktop API not available");
  }
  const result = await api.llamacppServerStop();
  if (!result.ok) {
    console.error("[llamacpp/stopServer] failed:", result.error);
    return thunkApi.rejectWithValue(result.error ?? "Stop failed");
  }
  console.log("[llamacpp/stopServer] OK");
  return true;
});

export const setLlamacppActiveModel = createAsyncThunk(
  "llamacpp/setActiveModel",
  async (modelId: string, thunkApi) => {
    console.log("[llamacpp/setActiveModel] requested:", modelId);
    const api = getDesktopApiOrNull();
    if (!api?.llamacppSetActiveModel) {
      console.error("[llamacpp/setActiveModel] Desktop API not available");
      return thunkApi.rejectWithValue("Desktop API not available");
    }

    thunkApi.dispatch(llamacppActions.setServerStatus("starting"));
    thunkApi.dispatch(llamacppActions.setActiveModelId(modelId));

    try {
      const result = await api.llamacppSetActiveModel({ model: modelId });
      if (!result.ok) {
        console.error("[llamacpp/setActiveModel] failed:", result.error);
        thunkApi.dispatch(llamacppActions.setServerStatus("error"));
        return thunkApi.rejectWithValue(result.error ?? "Failed to set model");
      }
      console.log("[llamacpp/setActiveModel] OK, modelId:", result.modelId);
      return result;
    } catch (err) {
      console.error("[llamacpp/setActiveModel] exception:", err);
      thunkApi.dispatch(llamacppActions.setServerStatus("error"));
      return thunkApi.rejectWithValue(errorToMessage(err));
    }
  }
);

export const warmupLocalModel = createAsyncThunk(
  "llamacpp/warmup",
  async (request: GatewayRequest, thunkApi) => {
    console.log("[llamacpp/warmup] starting KV cache warmup");
    thunkApi.dispatch(llamacppActions.setWarmupStatus("warming"));

    try {
      // sessions.create with message triggers the full agent pipeline
      // (fire-and-forget); completion is tracked via gateway event listener
      // in useLocalModelWarmup hook which waits for first token.
      const res = await request<{ key: string }>("sessions.create", {
        key: WARMUP_SESSION_KEY,
        message: "warmup",
      });
      // Gateway canonicalizes the key (e.g. "agent:default:__warmup__").
      // Return it so the event listener can match on the correct sessionKey.
      const canonicalKey = res?.key ?? WARMUP_SESSION_KEY;
      console.log("[llamacpp/warmup] session created, canonical key:", canonicalKey);
      return canonicalKey;
    } catch (err) {
      console.warn("[llamacpp/warmup] failed to create session:", err);
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
        state.serverStatus = action.payload.healthy
          ? "running"
          : action.payload.running
            ? "starting"
            : "stopped";
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

    builder.addCase(startLlamacppServer.fulfilled, (state, action) => {
      state.serverStatus = "running";
      if (action.payload?.modelId) {
        state.activeModelId = action.payload.modelId;
      }
    });

    builder.addCase(stopLlamacppServer.fulfilled, (state) => {
      state.serverStatus = "stopped";
      state.warmupStatus = "idle";
      state.warmupSessionKey = null;
    });

    builder.addCase(setLlamacppActiveModel.fulfilled, (state, action) => {
      state.serverStatus = "running";
      state.warmupStatus = "idle";
      state.warmupSessionKey = null;
      if (action.payload?.modelId) {
        state.activeModelId = action.payload.modelId;
      }
    });

    builder.addCase(warmupLocalModel.fulfilled, (state, action) => {
      // Store the canonical session key so the event listener can match it
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
