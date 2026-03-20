import React from "react";

import {
  GlassCard,
  HeroPageLayout,
  OnboardingDots,
  PrimaryButton,
  SecondaryButton,
  SplashLogo,
} from "@shared/kit";
import { useOnboardingStepEvent } from "@analytics/use-onboarding-step-event";
import layoutStyles from "../OnboardingStepLayout.module.css";
import s from "./SetupModePage.module.css";
import cursorIcon from "@assets/сursor.svg";
import googleIcon from "@assets/set-up-skills/Google.svg";

export type SetupModeChoice = "paid" | "self-managed";

export function SetupModePage(props: {
  totalSteps: number;
  activeStep: number;
  onSelect: (mode: SetupModeChoice) => void;
  onStartGoogleAuth?: () => void;
  authBusy?: boolean;
  authError?: string | null;
  onBack?: () => void;
}) {
  useOnboardingStepEvent("setup_mode", null);
  const [selected, setSelected] = React.useState<SetupModeChoice>("paid");

  return (
    <HeroPageLayout
      variant="compact"
      align="center"
      aria-label="Setup mode selection"
      className={layoutStyles.UiSetupLayout}
    >
      <div className={layoutStyles.UiSetupHeader}>
        <div className={layoutStyles.UiSetupHeaderButton}>
          {props.onBack ? (
            <button className="UiTextButton" type="button" onClick={props.onBack}>
              Back
            </button>
          ) : null}
        </div>
        <div className={layoutStyles.UiSetupHeaderCenter}>
          <OnboardingDots totalSteps={props.totalSteps} activeStep={props.activeStep} />
        </div>
        <div className={layoutStyles.UiSetupHeaderButton} />
      </div>
      <GlassCard className={`UiGlassCardOnboarding ${s.UiSetupModeCard}`}>
        <div className="UiSectionContent">
          <div>
            <div className="UiSectionTitle">Set up your AI agent</div>
            <div className="UiSectionSubtitle">
              Choose how you'd like to set up your OpenClaw. You can change this later.
            </div>
          </div>

          <div className={s.UiSetupModeOptions}>
            <div className="UiSectionCard UiSectionCardGreen">
              <div>
                <div className={s.UiSetupModeIconRow}>
                  <div className={s.UiSetupModeIcon}>
                    <SplashLogo iconAlt="Atomic Bot" size={35} />
                  </div>
                  <span className={s.UiSetupModeBadge}>Popular 🔥</span>
                </div>
                <div className={s.UiSetupModeTitle}>Do everything for me</div>
                <div className={s.UiSetupModeDesc}>Billed monthly</div>
                <ul className={s.UiSetupModeFeatures}>
                  <li>One-click setup</li>
                  <li>Access to 100+ AI models</li>
                  <li>Automatic credit management</li>
                </ul>
              </div>

              <PrimaryButton
                size="sm"
                className={s.UiGoogleButton}
                disabled={props.authBusy}
                onClick={() => {
                  if (props.onStartGoogleAuth) {
                    props.onStartGoogleAuth();
                    setSelected("paid");
                  } else {
                    props.onSelect("paid");
                    setSelected("paid");
                  }
                }}
              >
                {props.authBusy ? (
                  <span
                    className={`UiButtonSpinner ${s.UiGoogleButtonSpinner}`}
                    aria-hidden="true"
                  />
                ) : (
                  <img src={googleIcon} alt="" width={18} height={18} />
                )}
                Continue with Google
              </PrimaryButton>
              {props.authError ? <div className="UiErrorText">{props.authError}</div> : null}
            </div>

            <div className="UiSectionCard">
              <div>
                <div className={s.UiSetupModeIcon}>
                  <img src={cursorIcon} alt="" width={35} height={35} />
                </div>
                <div className={s.UiSetupModeTitle}>Manual setup</div>
                <div className={s.UiSetupModeDesc}>Free with your own API Keys</div>
                <ul className={s.UiSetupModeFeatures}>
                  <li>Use your own API keys</li>
                  <li>Full control over models</li>
                  <li>No subscription required</li>
                </ul>
              </div>

              <SecondaryButton
                size="sm"
                onClick={() => {
                  props.onSelect("self-managed");
                  setSelected("self-managed");
                }}
              >
                Set up with API keys
              </SecondaryButton>
            </div>
          </div>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
