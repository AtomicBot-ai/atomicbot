import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { DESKTOP_API_UNAVAILABLE, getDesktopApiOrNull } from "@ipc/desktopApi";
import { errorToMessage } from "@lib/error-format";
import { setVoiceProvider } from "@lib/voice-storage";

export type WhisperModelInfo = {
  id: string;
  label: string;
  description: string;
  sizeLabel: string;
  downloaded: boolean;
  size: number;
};

export type DownloadStatus =
  | { kind: "idle" }
  | { kind: "downloading"; modelId: string; percent: number }
  | { kind: "error"; message: string };

export type WhisperSliceState = {
  models: WhisperModelInfo[];
  selectedModelId: string;
  download: DownloadStatus;
};

const MODEL_STORAGE_KEY = "openclaw:whisperModel";

function readStoredModel(): string {
  try {
    return localStorage.getItem(MODEL_STORAGE_KEY) ?? "small";
  } catch {
    return "small";
  }
}

const initialState: WhisperSliceState = {
  models: [],
  selectedModelId: readStoredModel(),
  download: { kind: "idle" },
};

export const fetchWhisperModels = createAsyncThunk("whisper/fetchModels", async () => {
  const api = getDesktopApiOrNull();
  if (!api?.whisperModelsList) return [];
  return api.whisperModelsList();
});

export const downloadWhisperModel = createAsyncThunk(
  "whisper/downloadModel",
  async (modelId: string, thunkApi) => {
    const api = getDesktopApiOrNull();
    if (!api?.whisperModelDownload) {
      return thunkApi.rejectWithValue(DESKTOP_API_UNAVAILABLE);
    }

    thunkApi.dispatch(whisperActions.setDownload({ kind: "downloading", modelId, percent: 0 }));

    const unsub = api.onWhisperModelDownloadProgress?.((payload) => {
      thunkApi.dispatch(
        whisperActions.setDownload({ kind: "downloading", modelId, percent: payload.percent })
      );
    });

    try {
      const result = await api.whisperModelDownload({ model: modelId });
      unsub?.();
      if (!result.ok) {
        return thunkApi.rejectWithValue(result.error ?? "Download failed");
      }
      thunkApi.dispatch(fetchWhisperModels());
      thunkApi.dispatch(whisperActions.setSelectedModel(modelId));
      setVoiceProvider("local");
      // Persist selected model to main process and restart gateway
      await api.whisperSetGatewayModel?.(modelId);
      return modelId;
    } catch (err) {
      unsub?.();
      return thunkApi.rejectWithValue(errorToMessage(err));
    }
  }
);

export const cancelWhisperDownload = createAsyncThunk(
  "whisper/cancelDownload",
  async (_, thunkApi) => {
    const api = getDesktopApiOrNull();
    await api?.whisperModelDownloadCancel?.();
    thunkApi.dispatch(whisperActions.setDownload({ kind: "idle" }));
  }
);

const whisperSlice = createSlice({
  name: "whisper",
  initialState,
  reducers: {
    setSelectedModel(state, action: PayloadAction<string>) {
      state.selectedModelId = action.payload;
      try {
        localStorage.setItem(MODEL_STORAGE_KEY, action.payload);
      } catch {
        // ignore
      }
    },
    setDownload(state, action: PayloadAction<DownloadStatus>) {
      state.download = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchWhisperModels.fulfilled, (state, action) => {
      state.models = action.payload;
    });
    builder.addCase(downloadWhisperModel.fulfilled, (state) => {
      state.download = { kind: "idle" };
    });
    builder.addCase(downloadWhisperModel.rejected, (state, action) => {
      const msg = String(action.payload ?? action.error.message);
      if (msg === "cancelled") {
        state.download = { kind: "idle" };
        return;
      }
      state.download = { kind: "error", message: msg };
    });
  },
});

export const whisperActions = whisperSlice.actions;
export const whisperReducer = whisperSlice.reducer;
