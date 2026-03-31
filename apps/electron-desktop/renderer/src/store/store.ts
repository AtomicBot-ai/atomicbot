import { configureStore } from "@reduxjs/toolkit";
import {
  authRefreshListenerMiddleware,
  setupAuthRefreshListeners,
} from "./listeners/authRefreshListener";
import { authReducer } from "./slices/auth/authSlice";
import { chatReducer } from "./slices/chat/chatSlice";
import { configReducer } from "./slices/configSlice";
import { gatewayReducer } from "./slices/gatewaySlice";
import { onboardingReducer } from "./slices/onboardingSlice";
import { upgradePaywallReducer } from "./slices/upgradePaywallSlice";
import { llamacppReducer } from "./slices/llamacppSlice";
import { skillsReducer } from "./slices/skillsSlice";
import { whisperReducer } from "./slices/whisperSlice";

setupAuthRefreshListeners();

export const store = configureStore({
  reducer: {
    auth: authReducer,
    chat: chatReducer,
    config: configReducer,
    gateway: gatewayReducer,
    llamacpp: llamacppReducer,
    onboarding: onboardingReducer,
    skills: skillsReducer,
    upgradePaywall: upgradePaywallReducer,
    whisper: whisperReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Thunks receive a `request` function from React context; ignore it in action meta.
        ignoredActionPaths: ["meta.arg.request"],
      },
    }).prepend(authRefreshListenerMiddleware.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
