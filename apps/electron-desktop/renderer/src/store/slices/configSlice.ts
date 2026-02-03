import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { GatewayRequest } from "./chatSlice";

export type ConfigSnapshot = {
  path?: string;
  exists?: boolean;
  valid?: boolean;
  hash?: string;
  config?: unknown;
};

export type ConfigSliceState = {
  snap: ConfigSnapshot | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
};

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
      const snap = (await request("config.get", {})) as ConfigSnapshot;
      thunkApi.dispatch(configActions.setSnapshot(snap));
      thunkApi.dispatch(configActions.setStatus("ready"));
    } catch (err) {
      thunkApi.dispatch(configActions.setError(String(err)));
      thunkApi.dispatch(configActions.setStatus("error"));
    }
  },
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

