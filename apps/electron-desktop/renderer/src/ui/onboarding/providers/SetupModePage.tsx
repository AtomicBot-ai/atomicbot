import React from "react";

import { GlassCard, HeroPageLayout, OnboardingDots, SecondaryButton } from "@shared/kit";

import s from "./SetupModePage.module.css";
import cursorIcon from "@assets/сursor.svg";

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
  return (
    <HeroPageLayout variant="compact" align="center" aria-label="Setup mode selection">
      <GlassCard className={`UiGlassCardOnboarding ${s.UiSetupModeCard}`}>
        <OnboardingDots totalSteps={props.totalSteps} activeStep={props.activeStep} />

        <div className="UiSectionContent">
          <div>
            <div className="UiSectionTitle">Set up your AI agent</div>
            <div className="UiSectionSubtitle">
              Configure your AI agent with your own API keys. You can change this later.
            </div>
          </div>

          <div className={s.UiSetupModeOptions}>
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
