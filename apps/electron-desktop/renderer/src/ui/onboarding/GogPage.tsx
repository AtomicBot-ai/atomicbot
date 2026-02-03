import React from "react";

import { ActionButton, ButtonRow, GlassCard, HeroPageLayout, InlineError, TextInput } from "../kit";

export function GogPage(props: {
  status: string | null;
  error: string | null;
  gogBusy: boolean;
  gogError: string | null;
  gogOutput: string | null;
  gogAccount: string;
  setGogAccount: (value: string) => void;
  onRunAuthAdd: () => void;
  onRunAuthList: () => void;
  onFinish: () => void;
}) {
  return (
    <HeroPageLayout title="SETUP" variant="compact" align="center" aria-label="Gmail hooks setup">
      <GlassCard>
        <div className="UiSectionTitle">gog (Gmail hooks)</div>
        <div className="UiSectionSubtitle">
          Optional: authorize your Google account for Gmail hooks via the embedded <code>gog</code> binary. This opens a
          browser for consent.
        </div>
        {props.gogError ? <InlineError>{props.gogError}</InlineError> : null}
        {props.status ? <div className="UiSectionSubtitle">{props.status}</div> : null}
        {props.error ? <InlineError>{props.error}</InlineError> : null}
        <div style={{ marginTop: 10 }}>
          <TextInput
            type="text"
            value={props.gogAccount}
            onChange={props.setGogAccount}
            placeholder="you@gmail.com"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={props.gogBusy}
          />
          <ButtonRow>
            <ActionButton
              variant="primary"
              disabled={props.gogBusy || !props.gogAccount.trim()}
              onClick={props.onRunAuthAdd}
            >
              {props.gogBusy ? "Running…" : "Run gog auth add"}
            </ActionButton>
            <ActionButton disabled={props.gogBusy} onClick={props.onRunAuthList}>
              {props.gogBusy ? "Running…" : "Run gog auth list"}
            </ActionButton>
          </ButtonRow>
        </div>
        {props.gogOutput ? <pre style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{props.gogOutput}</pre> : null}
        <ButtonRow>
          <ActionButton variant="primary" onClick={props.onFinish}>
            Finish
          </ActionButton>
          <ActionButton onClick={props.onFinish}>Skip</ActionButton>
        </ButtonRow>
      </GlassCard>
    </HeroPageLayout>
  );
}

