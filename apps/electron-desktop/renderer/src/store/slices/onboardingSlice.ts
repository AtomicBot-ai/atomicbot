import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

const ONBOARDED_KEY = "openclaw.desktop.onboarded.v1";

export type OnboardingSliceState = {
  onboarded: boolean;
};

const initialState: OnboardingSliceState = {
  onboarded: false,
};

const desktopApi = (
  window as unknown as {
    openclawDesktop?: {
      setOnboarded?: (v: boolean) => Promise<unknown>;
      getOnboarded?: () => Promise<{ onboarded: boolean }>;
    };
  }
).openclawDesktop;

export const loadOnboardingFromStorage = createAsyncThunk(
  "onboarding/loadFromStorage",
  async (_: void, thunkApi) => {
    const onboarded =
      typeof localStorage !== "undefined" && localStorage.getItem(ONBOARDED_KEY) === "1";
    thunkApi.dispatch(onboardingActions.setOnboardedState(onboarded));
    desktopApi?.setOnboarded?.(onboarded).catch(() => {});
  }
);

export const setOnboarded = createAsyncThunk(
  "onboarding/setOnboarded",
  async (onboarded: boolean, thunkApi) => {
    if (typeof localStorage !== "undefined") {
      if (onboarded) {
        localStorage.setItem(ONBOARDED_KEY, "1");
      } else {
        localStorage.removeItem(ONBOARDED_KEY);
      }
    }
    desktopApi?.setOnboarded?.(onboarded).catch(() => {});
    thunkApi.dispatch(onboardingActions.setOnboardedState(onboarded));
  }
);

const onboardingSlice = createSlice({
  name: "onboarding",
  initialState,
  reducers: {
    setOnboardedState(state, action: PayloadAction<boolean>) {
      state.onboarded = action.payload;
    },
  },
});

export const onboardingActions = onboardingSlice.actions;
export const onboardingReducer = onboardingSlice.reducer;
