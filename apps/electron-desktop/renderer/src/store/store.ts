import { configureStore } from "@reduxjs/toolkit";
import { chatReducer } from "./slices/chatSlice";
import { configReducer } from "./slices/configSlice";
import { gatewayReducer } from "./slices/gatewaySlice";
import { onboardingReducer } from "./slices/onboardingSlice";

export const store = configureStore({
  reducer: {
    chat: chatReducer,
    config: configReducer,
    gateway: gatewayReducer,
    onboarding: onboardingReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Thunks receive a `request` function from React context; ignore it in action meta.
        ignoredActionPaths: ["meta.arg.request"],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

