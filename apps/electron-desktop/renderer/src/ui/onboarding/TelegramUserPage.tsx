import React from "react";

import { GlassCard, HeroPageLayout, PrimaryButton, TextInput } from "../kit";

export function TelegramUserPage(props: {
  status: string | null;
  error: string | null;
  telegramUserId: string;
  setTelegramUserId: (value: string) => void;
  channelsProbe: unknown;
  onNext: () => void;
  onSkip: () => void;
}) {
  const totalSteps = 5;
  const activeStep = 4;

  const [errorText, setErrorText] = React.useState("");
  const token = props.telegramUserId.trim();

  const handleSubmit = () => {
    if (errorText) {
      setErrorText("");
    }

    if (token) {
      props.onNext();
    } else {
      setErrorText("Please enter your token to continue");
    }
  };

  return (
    <HeroPageLayout variant="compact" align="center" aria-label="Telegram allowlist setup">
      <GlassCard className="UiApiKeyCard UiGlassCardOnboarding">
        <div className="UiOnboardingDots" aria-label="Onboarding progress">
          {Array.from({ length: totalSteps }).map((_, idx) => (
            <span
              // eslint-disable-next-line react/no-array-index-key
              key={idx}
              className={`UiOnboardingDot ${idx === activeStep ? "UiOnboardingDot--active" : ""}`}
              aria-hidden="true"
            />
          ))}
        </div>

        <div className="UiApiKeyTitle">Allow Telegram DMs</div>

        <div className="UiContentWrapper">
          <div className="UiApiKeySubtitle">
            Add your Telegram user id to the DM allowlist. This configures{" "}
            <code>channels.telegram.dmPolicy</code> to <code>allowlist</code> and appends to{" "}
            <code>channels.telegram.allowFrom</code>.
          </div>

          <div className="UiSectionSubtitle">
            Steps:
            <ol>
              <li>Send a DM to your bot (so it can see your account).</li>
              <li>
                Paste your numeric Telegram user id (<code>message.from.id</code>) below.
              </li>
            </ol>
            Tips:
            <ul>
              <li>
                Accepted forms: <code>123456789</code>, <code>tg:123456789</code>,{" "}
                <code>telegram:123456789</code>.
              </li>
              <li>
                If you're unsure, you can inspect the probe output (below) after saving, or use a
                Telegram “user info” bot to read your id.
              </li>
            </ul>
            Docs:{" "}
            <a
              href="https://docs.openclaw.ai/channels/telegram"
              target="_blank"
              rel="noopener noreferrer"
              className="UiLink"
              onClick={(e) => {
                e.preventDefault();
                void window.openclawDesktop?.openExternal(
                  "https://docs.openclaw.ai/channels/telegram"
                );
              }}
            >
              Telegram setup ↗
            </a>
          </div>

          {props.status ? <div className="UiSectionSubtitle">{props.status}</div> : null}

          <div className="UiApiKeyInputRow">
            <TextInput
              value={props.telegramUserId}
              onChange={props.setTelegramUserId}
              placeholder="123456789"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              isError={errorText}
            />
          </div>

          {props.channelsProbe ? (
            <details className="UiGoogleWorkspaceDetails" style={{ marginTop: 10 }}>
              <summary className="UiGoogleWorkspaceDetailsSummary">
                Troubleshooting: channels.status (probe)
              </summary>
              <div className="UiSectionSubtitle" style={{ marginTop: 10 }}>
                <div className="UiPill">channels.status (probe)</div>
                <pre style={{ maxHeight: 240, overflow: "auto" }}>
                  {JSON.stringify(props.channelsProbe, null, 2)}
                </pre>
              </div>
            </details>
          ) : null}

          <div className="UiApiKeySpacer" aria-hidden="true" />
        </div>

        <div className="UiApiKeyButtonRow">
          <button className="UiTextButton" onClick={props.onSkip} type="button">
            Back
          </button>
          <PrimaryButton size={"sm"} onClick={handleSubmit}>
            Save & return
          </PrimaryButton>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
