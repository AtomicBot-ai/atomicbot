import React from "react";
import { useAppDispatch } from "@store/hooks";
import { storeAuthToken } from "@store/slices/auth/authSlice";
import { backendApi } from "@ipc/backendApi";
import { openExternal } from "@shared/utils/openExternal";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "https://api.atomicbot.ai";

type AuthSuccessParams = { jwt: string; email: string; userId: string; isNewUser: boolean };

type UsePaidGoogleAuthOptions = {
  onAuthSuccess: () => Promise<void>;
};

export function usePaidGoogleAuth({ onAuthSuccess }: UsePaidGoogleAuthOptions) {
  const dispatch = useAppDispatch();
  const [authBusy, setAuthBusy] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [alreadySubscribed, setAlreadySubscribed] = React.useState(false);

  const startGoogleAuth = React.useCallback(async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      const url = `${BACKEND_URL}/auth/google/desktop`;
      openExternal(url);
    } catch (err) {
      setAuthError(String(err));
      setAuthBusy(false);
    }
  }, []);

  const onGoogleAuthSuccess = React.useCallback(
    async (params: AuthSuccessParams) => {
      try {
        await dispatch(storeAuthToken(params));

        try {
          const status = await backendApi.getStatus(params.jwt);
          if (status.subscription && status.hasKey) {
            setAlreadySubscribed(true);
          }
        } catch {
          // Status check failed -- continue with normal onboarding flow
        }

        await onAuthSuccess();
      } catch (err) {
        setAuthError(String(err));
      } finally {
        setAuthBusy(false);
      }
    },
    [dispatch, onAuthSuccess]
  );

  const onAuthError = React.useCallback(() => {
    setAuthError("Authentication failed \u2014 missing token data");
    setAuthBusy(false);
  }, []);

  return {
    authBusy,
    authError,
    alreadySubscribed,
    startGoogleAuth,
    onGoogleAuthSuccess,
    onAuthError,
  };
}
