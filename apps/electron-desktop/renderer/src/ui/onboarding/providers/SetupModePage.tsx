import React from "react";

import { GlassCard, HeroPageLayout, PrimaryButton, SecondaryButton, SplashLogo } from "@shared/kit";
import { InfoIcon } from "@shared/kit/icons";
import { useOnboardingStepEvent } from "@analytics/use-onboarding-step-event";
import { OnboardingHeader } from "../OnboardingHeader";
import s from "./SetupModePage.module.css";
import googleIcon from "@assets/set-up-skills/Google.svg";

export type SetupModeChoice = "paid" | "self-managed" | "local-model";

export function SetupModePage(props: {
  totalSteps: number;
  activeStep: number;
  onSelect: (mode: SetupModeChoice) => void;
  onStartGoogleAuth?: () => void;
  authBusy?: boolean;
  authError?: string | null;
  onBack?: () => void;
  showLocalModel?: boolean;
}) {
  useOnboardingStepEvent("setup_mode", null);
  const [_, setSelected] = React.useState<SetupModeChoice>("paid");

  return (
    <HeroPageLayout
      variant="compact"
      align="center"
      aria-label="Setup mode selection"
      context="onboarding"
    >
      <div
        className={`${s.UiSetupModeHeader} ${props.showLocalModel ? "" : s.UiSetupModeHeaderTwoColumns}`}
      >
        <OnboardingHeader
          totalSteps={props.totalSteps}
          activeStep={props.activeStep}
          onBack={props.onBack}
        />
      </div>
      <GlassCard
        className={`${s.UiSetupModeCard} ${props.showLocalModel ? "" : s.UiSetupModeCardTwoColumns}`}
      >
        <div className="UiSectionContent">
          <div>
            <div className="UiSectionTitle">Choose how to run your AI agent</div>
            <div className="UiSectionSubtitle">
              Pick what works for you - you can switch anytime.
            </div>
          </div>

          <div
            className={`${s.UiSetupModeOptions} ${props.showLocalModel ? "" : s.UiSetupModeOptionsTwoColumns}`}
          >
            <div className={`UiSectionCard UiSectionCardGreen ${s.UiSetupModeOptionCard}`}>
              <div className={s.UiSetupModeCardBody}>
                <div className={s.UiSetupModeIconRow}>
                  <div className={s.UiSetupModeIcon}>
                    <SplashLogo iconAlt="Atomic Bot" size={35} />
                  </div>
                  <span className={s.UiSetupModeBadge}>Popular 🔥</span>
                </div>
                <div className={s.UiSetupModeTitle}>Ready to go</div>
                <div className={s.UiSetupModeDesc}>Starts with a free trial</div>
                <ul className={s.UiSetupModeFeatures}>
                  <li>One-click setup, works instantly</li>
                  <li>100+ AI models included</li>
                  <li>Credits and billing managed for you</li>
                </ul>
              </div>

              <div className={s.UiSetupModeCardFooter}>
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
            </div>

            <div className={`UiSectionCard ${s.UiSetupModeOptionCard}`}>
              <div className={s.UiSetupModeCardBody}>
                <div className={s.UiSetupModeIcon}>
                  <span style={{ fontSize: 24 }}>🔑</span>
                </div>
                <div className={s.UiSetupModeTitle}>Bring your own API keys</div>
                <div className={s.UiSetupModeDesc}>Pay providers directly</div>
                <ul className={s.UiSetupModeFeatures}>
                  <li>Connect OpenRouter, Ollama, Anthropic and others</li>
                  <li>Full control over models and spending</li>
                  <li>Pay only for what you use</li>
                </ul>
              </div>

              <div className={s.UiSetupModeCardFooter}>
                <SecondaryButton
                  size="sm"
                  onClick={() => {
                    props.onSelect("self-managed");
                    setSelected("self-managed");
                  }}
                >
                  Connect API keys
                </SecondaryButton>
              </div>
            </div>

            {props.showLocalModel && (
              <div className={`UiSectionCard ${s.UiSetupModeOptionCard}`}>
                <div className={s.UiSetupModeCardBody}>
                  <div className={s.UiSetupModeIcon}>
                    <span style={{ fontSize: 24 }}>🖥</span>
                  </div>
                  <div className={s.UiSetupModeTitle}>Free local models</div>
                  <div className={s.UiSetupModeDesc}>Fully private</div>
                  <ul className={s.UiSetupModeFeatures}>
                    <li>Works offline</li>
                    <li>Your data never leaves your machine</li>
                    <li className={s.UiSetupModeFeatureNote}>
                      <span className={s.UiSetupModeFeatureNoteIcon} aria-hidden="true">
                        <InfoIcon />
                      </span>
                      <span>macOS only</span>
                    </li>
                  </ul>
                </div>

                <div className={s.UiSetupModeCardFooter}>
                  <SecondaryButton
                    size="sm"
                    onClick={() => {
                      props.onSelect("local-model");
                      setSelected("local-model");
                    }}
                  >
                    Set up local models
                  </SecondaryButton>
                </div>
              </div>
            )}
          </div>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
