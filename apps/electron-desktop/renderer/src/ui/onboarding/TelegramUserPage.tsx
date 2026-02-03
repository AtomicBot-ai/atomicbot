import React from "react";

import { ActionButton, ButtonRow, GlassCard, HeroPageLayout, InlineError, TextInput } from "../kit";

export function TelegramUserPage(props: {
  status: string | null;
  error: string | null;
  telegramUserId: string;
  setTelegramUserId: (value: string) => void;
  channelsProbe: unknown;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <HeroPageLayout title="SETUP" variant="compact" align="center" aria-label="Telegram allowlist setup">
      <GlassCard>
        <div className="UiSectionTitle">Telegram allowlist (your user id)</div>
        <div className="UiSectionSubtitle">
          DM your bot first, then paste your numeric Telegram user id (<code>message.from.id</code>) to allow direct
          messages.
        </div>
        {props.status ? <div className="UiSectionSubtitle">{props.status}</div> : null}
        {props.error ? <InlineError>{props.error}</InlineError> : null}
        <TextInput
          value={props.telegramUserId}
          onChange={props.setTelegramUserId}
          placeholder="e.g. 123456789"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        {props.channelsProbe ? (
          <div style={{ marginTop: 10 }}>
            <div className="UiPill">channels.status (probe)</div>
            <pre style={{ maxHeight: 240 }}>{JSON.stringify(props.channelsProbe, null, 2)}</pre>
          </div>
        ) : null}
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

