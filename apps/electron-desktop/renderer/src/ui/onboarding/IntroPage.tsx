import React from "react";

import { GlassCard, HeroPageLayout, InlineError, PrimaryButton } from "../kit";

export function IntroPage(props: {
  startBusy: boolean;
  error: string | null;
  onStart: () => void;
}) {
  return (
    <HeroPageLayout title="WELCOME" variant="compact" aria-label="Welcome setup">
      <GlassCard className="UiGlassCard-intro">
        <div className="UiIntroInner">
          <div className="UiSectionTitle">Hi.</div>
          <div className="UiSectionSubtitle">
            You'll go through a few quick steps to get the desktop app ready: config defaults, Anthropic, Telegram, and
            optional Gmail hooks.
          </div>
          {props.error ? <InlineError>{props.error}</InlineError> : null}
          <PrimaryButton disabled={props.startBusy} onClick={props.onStart}>
            {props.startBusy ? "Starting…" : "Let's start"}
          </PrimaryButton>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}

