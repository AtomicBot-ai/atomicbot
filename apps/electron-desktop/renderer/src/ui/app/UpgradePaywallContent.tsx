import React from "react";
import { PrimaryButton, InfoTooltip, Toggle, CheckIcon } from "@shared/kit";
import { usePaidOnboarding } from "@ui/onboarding/hooks/usePaidOnboarding";
import { useNavigate } from "react-router-dom";
import { addToastError } from "@shared/toast";
import { SubscriptionPriceInfo } from "@ipc/backendApi";
import { FEATURES, PAYMENT_CONFIG } from "../../config/paymentConfig";
import s from "./UpgradePaywallPopup.module.css";

function formatPrice(price: SubscriptionPriceInfo | null): string {
  if (!price || !price.amountCents) return "$19/mo";
  const dollars = price.amountCents / 100;
  return `$${dollars.toFixed(dollars % 1 === 0 ? 0 : 2)}`;
}

export function UpgradePaywallContent() {
  const navigate = useNavigate();
  const paid = usePaidOnboarding({ navigate });
  const subscriptionPrice = paid.pay.subscriptionPrice;
  const priceLabel = formatPrice(subscriptionPrice);

  const handleToggle = React.useCallback(
    async (enabled: boolean) => {
      try {
        await paid.billing.onAutoTopUpPatch({
          enabled,
        });
      } catch (patchError) {
        addToastError(patchError);
      }
    },
    [paid.billing.onAutoTopUpPatch, addToastError]
  );

  return (
    <div className={s.card}>
      <div className={s.priceRow}>
        <span className={s.price}>{priceLabel}</span>
        <span className={s.priceSuffix}>/month</span>
      </div>

      <ul className={s.featureList}>
        {FEATURES.map((feature, i) => (
          <li key={i} className={s.featureItem}>
            <CheckIcon />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className={s.footer}>
        <div className={s.footerRow}>
          <div className={s.refillRow}>
            <span>Auto refill credits</span>
            <InfoTooltip text={PAYMENT_CONFIG.autoRefillConditions} />
          </div>
          <Toggle
            checked={paid.billing.autoTopUp.enabled}
            onChange={(checked) => handleToggle(checked)}
            aria-label="Set Auto Refill"
          />
        </div>

        <div className={s.buttonWrap}>
          <PrimaryButton
            disabled={paid.pay.busy}
            loading={paid.pay.busy}
            onClick={() => paid.pay.onPay()}
          >
            Start 7-Day Free Trial
          </PrimaryButton>
        </div>

        <div className={s.trialNote}>Free access for 7 days, then {priceLabel} per month</div>
      </div>
    </div>
  );
}
