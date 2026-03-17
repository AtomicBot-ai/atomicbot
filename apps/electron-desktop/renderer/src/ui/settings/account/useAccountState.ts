/** @deprecated Part of the legacy Account tab — scheduled for removal. */
import React from "react";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  storeAuthToken,
  switchToSubscription,
  applySubscriptionKeys,
  handleLogout,
  createAddonCheckout,
  fetchBalance,
  fetchDesktopStatus,
  fetchAutoTopUpSettings,
  patchAutoTopUpSettings,
} from "@store/slices/auth/authSlice";
import { useGatewayRpc } from "@gateway/context";
import { backendApi, type SubscriptionPriceInfo } from "@ipc/backendApi";
import { openExternal } from "@shared/utils/openExternal";
import { useDeepLinkAuth, type DeepLinkAuthParams } from "@shared/hooks/useDeepLinkAuth";
import { addToastError, addToast } from "@shared/toast";

export function useAccountState() {
  const dispatch = useAppDispatch();
  const gw = useGatewayRpc();
  const {
    mode,
    jwt,
    email,
    balance,
    subscription,
    lastRefreshAt,
    loading,
    topUpPending,
    balancePolling,
    autoTopUp,
    autoTopUpLoading,
    autoTopUpSaving,
    autoTopUpError,
    autoTopUpLoaded,
  } = useAppSelector((st) => st.auth);

  const [portalBusy, setPortalBusy] = React.useState(false);
  const [topUpAmount, setTopUpAmount] = React.useState("10.00");
  const [confirmLogoutOpen, setConfirmLogoutOpen] = React.useState(false);
  const [logoutBusy, setLogoutBusy] = React.useState(false);
  const [subscribeBusy, setSubscribeBusy] = React.useState(false);
  const [subscribePaymentPending, setSubscribePaymentPending] = React.useState(false);
  const [provisioning, setProvisioning] = React.useState(false);
  const [subscriptionPrice, setSubscriptionPrice] = React.useState<SubscriptionPriceInfo | null>(
    null
  );

  const jwtRef = React.useRef(jwt);
  React.useEffect(() => {
    jwtRef.current = jwt;
  }, [jwt]);

  const provisionCancelRef = React.useRef(false);
  React.useEffect(() => {
    provisionCancelRef.current = false;
    return () => {
      provisionCancelRef.current = true;
    };
  }, []);

  const hasLoadedStatus = lastRefreshAt !== null;
  const needsSubscription =
    hasLoadedStatus && subscription === null && balance === null && !provisioning;

  // Refresh balance (with sync) when the Account tab is opened.
  React.useEffect(() => {
    if (mode === "paid" && jwt) {
      void dispatch(fetchBalance());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeepLinkAuth = React.useCallback(
    (params: DeepLinkAuthParams) => {
      void (async () => {
        await dispatch(storeAuthToken(params));
        await dispatch(fetchDesktopStatus());
        await dispatch(switchToSubscription({ request: gw.request }));
        try {
          await dispatch(
            applySubscriptionKeys({ token: params.jwt, request: gw.request })
          ).unwrap();
        } catch (err) {
          console.warn("[AccountTab] Failed to apply subscription keys:", err);
        }
      })();
    },
    [dispatch, gw.request]
  );

  const handleStripeSuccess = React.useCallback(() => {
    setSubscribePaymentPending(false);
    setProvisioning(true);
    provisionCancelRef.current = false;
    void (async () => {
      const currentJwt = jwtRef.current;
      if (!currentJwt) {
        setProvisioning(false);
        return;
      }
      let attempts = 0;
      while (!provisionCancelRef.current && attempts < 60) {
        attempts++;
        try {
          const status = await backendApi.getStatus(currentJwt);
          if (status.hasKey) {
            try {
              await dispatch(
                applySubscriptionKeys({ token: currentJwt, request: gw.request })
              ).unwrap();
            } catch (e) {
              console.warn("[AccountTab] Failed to apply subscription keys:", e);
            }
            void dispatch(fetchDesktopStatus());
            setProvisioning(false);
            addToast("Subscription activated!");
            return;
          }
        } catch {
          // Retry on transient errors
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      setProvisioning(false);
      void dispatch(fetchDesktopStatus());
    })();
  }, [dispatch, gw.request]);

  useDeepLinkAuth({
    onAuth: handleDeepLinkAuth,
    onStripeSuccess: handleStripeSuccess,
  });

  React.useEffect(() => {
    if (mode !== "paid" || !jwt || autoTopUpLoaded || autoTopUpLoading) {
      return;
    }
    void dispatch(fetchAutoTopUpSettings());
  }, [autoTopUpLoaded, autoTopUpLoading, dispatch, jwt, mode]);

  React.useEffect(() => {
    if (!needsSubscription || subscriptionPrice) return;
    void backendApi
      .getSubscriptionInfo()
      .then(setSubscriptionPrice)
      .catch(() => {});
  }, [needsSubscription, subscriptionPrice]);

  const handleSubscribe = React.useCallback(async () => {
    if (!jwt) return;
    setSubscribeBusy(true);
    try {
      const result = await backendApi.createSetupCheckout(jwt, {});
      openExternal(result.checkoutUrl);
      setSubscribePaymentPending(true);
    } catch (err) {
      addToastError(err);
    } finally {
      setSubscribeBusy(false);
    }
  }, [jwt]);

  const handleManageSubscription = React.useCallback(async () => {
    if (!jwt) return;
    setPortalBusy(true);
    try {
      const result = await backendApi.getPortalUrl(jwt);
      openExternal(result.portalUrl);
    } catch (err) {
      addToastError(err);
    } finally {
      setPortalBusy(false);
    }
  }, [jwt]);

  const onLogout = React.useCallback(() => {
    setConfirmLogoutOpen(true);
  }, []);

  const handleConfirmLogout = React.useCallback(async () => {
    setLogoutBusy(true);
    try {
      await dispatch(handleLogout({ request: gw.request })).unwrap();
      addToast("Logged out. Sign in again anytime.");
      setConfirmLogoutOpen(false);
    } catch (err) {
      addToastError(err);
    } finally {
      setLogoutBusy(false);
    }
  }, [dispatch, gw.request]);

  const handleContinueWithGoogle = React.useCallback(() => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || "https://api.atomicbot.ai";
    const url = `${backendUrl}/auth/google/desktop`;
    openExternal(url);
  }, []);

  const handleTopUp = React.useCallback(async () => {
    const amount = Number.parseFloat(topUpAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      addToast("Enter a valid amount");
      return;
    }
    try {
      const result = await dispatch(createAddonCheckout({ amountUsd: amount })).unwrap();
      openExternal(result.checkoutUrl);
    } catch (err) {
      addToastError(err);
    }
  }, [dispatch, topUpAmount]);

  const handleAutoTopUpPatch = React.useCallback(
    async (payload: {
      enabled?: boolean;
      thresholdUsd?: number;
      topupAmountUsd?: number;
      monthlyCapUsd?: number | null;
    }) => {
      await dispatch(patchAutoTopUpSettings(payload)).unwrap();
    },
    [dispatch]
  );

  return {
    mode,
    jwt,
    email,
    balance,
    subscription,
    lastRefreshAt,
    loading,
    topUpPending,
    balancePolling,
    autoTopUp,
    autoTopUpLoading,
    autoTopUpSaving,
    autoTopUpError,
    needsSubscription,
    subscriptionPrice,

    portalBusy,
    topUpAmount,
    setTopUpAmount,
    confirmLogoutOpen,
    setConfirmLogoutOpen,
    logoutBusy,
    subscribeBusy,
    subscribePaymentPending,
    provisioning,

    handleSubscribe,
    handleManageSubscription,
    onLogout,
    handleConfirmLogout,
    handleContinueWithGoogle,
    handleTopUp,
    handleAutoTopUpPatch,
  };
}
