import React from "react";
import { GlassCard, HeroPageLayout, OnboardingDots } from "@shared/kit";
import { useOnboardingStepEvent } from "@analytics/use-onboarding-step-event";
import type { SubscriptionPriceInfo } from "@ipc/backendApi";
import type { AutoTopUpState } from "@store/slices/auth/authSlice";
import { UpgradePaywallContent } from "@ui/app/UpgradePaywallContent";
import layoutStyles from "./OnboardingStepLayout.module.css";
import s from "./SetupReviewPage.module.css";

export function SetupReviewPage(props: {
  totalSteps: number;
  activeStep: number;
  selectedModel: string;
  subscriptionPrice: SubscriptionPriceInfo | null;
  onPay: () => void;
  onBack: () => void;
  onCancelPayment?: () => void;
  busy?: boolean;
  paymentPending?: boolean;
  autoTopUp: AutoTopUpState;
  autoTopUpLoading: boolean;
  autoTopUpSaving: boolean;
  autoTopUpError: string | null;
  onAutoTopUpPatch: (payload: {
    enabled?: boolean;
    thresholdUsd?: number;
    topupAmountUsd?: number;
    monthlyCapUsd?: number | null;
  }) => Promise<unknown>;
  onError?: (error: unknown) => void;
  onSkip?: () => void;
}) {
  useOnboardingStepEvent("setup_review", "paid");
  if (props.paymentPending) {
    return (
      <HeroPageLayout variant="compact" align="center" aria-label="Waiting for payment">
        <GlassCard className={`UiGlassCardOnboarding ${s.UiSetupReviewCard}`}>
          <div className={s.UiSetupReviewPending}>
            <span className="UiButtonSpinner" aria-hidden="true" />
            <div className={s.UiSetupReviewPendingTitle}>Waiting for payment...</div>
            <div className={s.UiSetupReviewPendingHint}>
              Complete the checkout in your browser, then return here.
            </div>
            <button
              className="UiTextButton"
              type="button"
              onClick={props.onCancelPayment ?? props.onBack}
            >
              Back
            </button>
          </div>
        </GlassCard>
      </HeroPageLayout>
    );
  }

  return (
    <HeroPageLayout
      variant="compact"
      align="center"
      aria-label="Setup review"
      className={layoutStyles.UiSetupLayout}
    >
      <div className={layoutStyles.UiSetupHeader}>
        <div className={layoutStyles.UiSetupHeaderButton}>
          <button className="UiTextButton" type="button" onClick={props.onBack}>
            Back
          </button>
        </div>
        <div className={layoutStyles.UiSetupHeaderCenter}>
          <OnboardingDots totalSteps={props.totalSteps} activeStep={props.activeStep} />
        </div>
        <div className={layoutStyles.UiSetupHeaderRight}>
          {props.onSkip ? (
            <button className="UiTextButton" type="button" onClick={props.onSkip}>
              Skip
            </button>
          ) : null}
        </div>
      </div>

      <GlassCard className={`UiGlassCardOnboarding ${s.UiSetupReviewCard}`}>
        <div className={`UiSectionTitle ${s.UiSectionTitleSetup}`}>
          Upgrade to unlock all features
        </div>

        <UpgradePaywallContent />
      </GlassCard>
    </HeroPageLayout>
  );
}
