import { createSlice } from "@reduxjs/toolkit";

export type UpgradePaywallSliceState = {
  isOpen: boolean;
};

const initialState: UpgradePaywallSliceState = {
  isOpen: false,
};

const upgradePaywallSlice = createSlice({
  name: "upgradePaywall",
  initialState,
  reducers: {
    open(state) {
      state.isOpen = true;
    },
    close(state) {
      state.isOpen = false;
    },
  },
});

export const upgradePaywallActions = upgradePaywallSlice.actions;
export const upgradePaywallReducer = upgradePaywallSlice.reducer;
