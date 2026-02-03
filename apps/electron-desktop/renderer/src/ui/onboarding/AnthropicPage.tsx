import React from "react";

import { ActionButton, ButtonRow, GlassCard, HeroPageLayout, InlineError, TextInput } from "../kit";

export function AnthropicPage(props: {
  status: string | null;
  error: string | null;
  anthropicKey: string;
  setAnthropicKey: (value: string) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <HeroPageLayout title="SETUP" variant="compact" align="center" aria-label="Anthropic setup">
      <GlassCard>
        <div className="UiSectionTitle">Anthropic API key</div>
        <div className="UiSectionSubtitle">
          Stored locally in <code>auth-profiles.json</code>. We'll enable the default profile and set a default model.
        </div>
        {props.status ? <div className="UiSectionSubtitle">{props.status}</div> : null}
        {props.error ? <InlineError>{props.error}</InlineError> : null}
        <TextInput
          type="password"
          value={props.anthropicKey}
          onChange={props.setAnthropicKey}
          placeholder="Anthropic API key"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <ButtonRow>
          <ActionButton variant="primary" onClick={props.onNext}>
            Next
          </ActionButton>
          <ActionButton onClick={props.onSkip}>Skip</ActionButton>
        </ButtonRow>
      </GlassCard>
    </HeroPageLayout>
  );
}

