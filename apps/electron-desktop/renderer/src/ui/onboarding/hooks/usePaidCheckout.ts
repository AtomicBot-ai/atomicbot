import React from "react";
import { backendApi, type SubscriptionPriceInfo } from "@ipc/backendApi";
import { openExternal } from "@shared/utils/openExternal";

export function usePaidCheckout(jwt: string | null) {
  const [payBusy, setPayBusy] = React.useState(false);
  const [payError, setPayError] = React.useState<string | null>(null);
  const [paymentPending, setPaymentPending] = React.useState(false);
  const [subscriptionPrice, setSubscriptionPrice] = React.useState<SubscriptionPriceInfo | null>(
    null
  );

  const loadSubscriptionPrice = React.useCallback(async () => {
    try {
      const info = await backendApi.getSubscriptionInfo();
      setSubscriptionPrice(info);
    } catch {
      // Non-critical: UI will show a fallback price
    }
  }, []);

  const cancelPending = React.useCallback(() => setPaymentPending(false), []);

  const onPay = React.useCallback(async () => {
    if (!jwt) {
      setPayError("Not authenticated");
      return;
    }

    setPayBusy(true);
    setPayError(null);

    try {
      const result = await backendApi.createSetupCheckout(jwt, {});
      openExternal(result.checkoutUrl);
      setPaymentPending(true);
    } catch (err) {
      setPayError(String(err));
    } finally {
      setPayBusy(false);
    }
  }, [jwt]);

  return {
    payBusy,
    payError,
    paymentPending,
    cancelPending,
    subscriptionPrice,
    loadSubscriptionPrice,
    onPay,
  };
}
