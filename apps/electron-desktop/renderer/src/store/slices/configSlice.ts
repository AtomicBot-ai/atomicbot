import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { errorToMessage } from "@lib/error-format";
import type { GatewayRequest } from "./chat/chatSlice";

/** Typed structure for openclaw config; allows other fields via index signature. */
export type ConfigData = {
  agents?: {
    defaults?: {
      model?: { primary?: string };
      models?: Record<string, unknown>;
    };
  };
  auth?: {
    profiles?: Record<string, { provider: string; mode: string }>;
    order?: Record<string, string[]>;
  };
  [key: string]: unknown;
};

export type ConfigSnapshot = {
  path?: string;
  exists?: boolean;
  valid?: boolean;
  hash?: string;
  config?: ConfigData;
};

export type ConfigSliceState = {
  snap: ConfigSnapshot | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
};

const LLAMACPP_PRIMARY_PREFIX = "llamacpp/";

/** Bundled local model id from `agents.defaults.model.primary` (e.g. `qwen-3.5-9b`). */
export function extractLlamacppDefaultModelId(config: ConfigData | undefined | null): string | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }
  const primary = config.agents?.defaults?.model?.primary;
  const raw = typeof primary === "string" ? primary.trim() : "";
  if (!raw.startsWith(LLAMACPP_PRIMARY_PREFIX)) {
    return null;
  }
  const id = raw.slice(LLAMACPP_PRIMARY_PREFIX.length).trim();
  return id || null;
}

const initialState: ConfigSliceState = {
  snap: null,
  status: "idle",
  error: null,
};

export const reloadConfig = createAsyncThunk(
  "config/reloadConfig",
  async ({ request }: { request: GatewayRequest }, thunkApi) => {
    thunkApi.dispatch(configActions.setError(null));
    thunkApi.dispatch(configActions.setStatus("loading"));
    try {
      const snap = await request<ConfigSnapshot>("config.get", {});
      thunkApi.dispatch(configActions.setSnapshot(snap));
      thunkApi.dispatch(configActions.setStatus("ready"));
    } catch (err) {
      thunkApi.dispatch(configActions.setError(errorToMessage(err)));
      thunkApi.dispatch(configActions.setStatus("error"));
    }
  }
);

const configSlice = createSlice({
  name: "config",
  initialState,
  reducers: {
    setStatus(state, action: PayloadAction<ConfigSliceState["status"]>) {
      state.status = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    setSnapshot(state, action: PayloadAction<ConfigSnapshot | null>) {
      state.snap = action.payload;
    },
  },
});

export const configActions = configSlice.actions;
export const configReducer = configSlice.reducer;
