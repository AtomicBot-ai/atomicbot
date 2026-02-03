import React from "react";

import { ActionButton, ButtonRow, GlassCard, HeroPageLayout, InlineError, TextInput } from "../kit";

export function TelegramTokenPage(props: {
  status: string | null;
  error: string | null;
  telegramToken: string;
  setTelegramToken: (value: string) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <HeroPageLayout title="SETUP" variant="compact" align="center" aria-label="Telegram token setup">
      <GlassCard>
        <div className="UiSectionTitle">Telegram bot token</div>
        <div className="UiSectionSubtitle">
          Paste the token from BotFather. We'll store it as <code>channels.telegram.botToken</code>.
        </div>
        {props.status ? <div className="UiSectionSubtitle">{props.status}</div> : null}
        {props.error ? <InlineError>{props.error}</InlineError> : null}
        <TextInput
          type="password"
          value={props.telegramToken}
          onChange={props.setTelegramToken}
          placeholder="123456:ABCDEF"
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

