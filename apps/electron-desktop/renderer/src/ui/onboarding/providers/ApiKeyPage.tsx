import React, { useState } from "react";

import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { useOnboardingStepEvent } from "@analytics/use-onboarding-step-event";
import { openExternal } from "@shared/utils/openExternal";
import { GlassCard, HeroPageLayout, OnboardingDots, PrimaryButton, TextInput } from "@shared/kit";
import layoutStyles from "../OnboardingStepLayout.module.css";
import type { Provider } from "./ProviderSelectPage";
import { MODEL_PROVIDER_BY_ID } from "@shared/models/providers";

type AuthMode = "api_key" | "setup_token";

const ANTHROPIC_SETUP_TOKEN_PREFIX = "sk-ant-oat01-";
const ANTHROPIC_SETUP_TOKEN_MIN_LENGTH = 80;

function validateSetupToken(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "Please paste your setup token";
  }
  if (!trimmed.startsWith(ANTHROPIC_SETUP_TOKEN_PREFIX)) {
    return `Token should start with ${ANTHROPIC_SETUP_TOKEN_PREFIX}`;
  }
  if (trimmed.length < ANTHROPIC_SETUP_TOKEN_MIN_LENGTH) {
    return "Token looks too short — paste the full setup-token";
  }
  return undefined;
}

/** Whether the provider supports a setup-token auth method in addition to API key. */
function supportsSetupToken(provider: Provider): boolean {
  return provider === "anthropic";
}

export function ApiKeyPage(props: {
  totalSteps: number;
  activeStep: number;
  provider: Provider;
  status: string | null;
  error: string | null;
  busy: boolean;
  onSubmit: (apiKey: string) => void;
  onSubmitSetupToken?: (token: string) => void;
  onBack: () => void;
}) {
  useOnboardingStepEvent("api_key", "self-managed");
  const [apiKey, setApiKey] = React.useState("");
  const [setupToken, setSetupToken] = React.useState("");
  const meta = MODEL_PROVIDER_BY_ID[props.provider];
  const [errorText, setErrorText] = useState("");
  const [validating, setValidating] = useState(false);
  const hasTokenMode = supportsSetupToken(props.provider);
  const [authMode, setAuthMode] = useState<AuthMode>("api_key");

  const handleSubmitApiKey = async () => {
    if (errorText) {
      setErrorText("");
    }
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setErrorText("Please enter your API key to continue");
      return;
    }

    setValidating(true);
    try {
      const result = await getDesktopApiOrNull()?.validateApiKey(props.provider, trimmed);
      if (result && !result.valid) {
        setErrorText(result.error ?? "Invalid API key.");
        return;
      }
    } catch {
      // If validation IPC is unavailable, allow saving anyway
    } finally {
      setValidating(false);
    }

    props.onSubmit(trimmed);
  };

  const handleSubmitSetupToken = () => {
    const err = validateSetupToken(setupToken);
    if (err) {
      setErrorText(err);
      return;
    }
    props.onSubmitSetupToken?.(setupToken.trim());
  };

  const handleSubmit = () => {
    if (authMode === "setup_token") {
      handleSubmitSetupToken();
    } else {
      void handleSubmitApiKey();
    }
  };

  const switchAuthMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setErrorText("");
  };

  const isBusy = props.busy || validating;

  return (
    <HeroPageLayout
      variant="compact"
      align="center"
      aria-label="API key setup"
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
        <div className={layoutStyles.UiSetupHeaderButton} />
      </div>
      <GlassCard className="UiApiKeyCard UiGlassCardOnboarding">
        {hasTokenMode ? (
          <div className="UiAuthModeToggle" role="radiogroup" aria-label="Authentication method">
            <button
              type="button"
              className={`UiAuthModeBtn ${authMode === "api_key" ? "UiAuthModeBtn--active" : ""}`}
              onClick={() => switchAuthMode("api_key")}
              disabled={isBusy}
            >
              I have API key
            </button>
            <button
              type="button"
              className={`UiAuthModeBtn ${authMode === "setup_token" ? "UiAuthModeBtn--active" : ""}`}
              onClick={() => switchAuthMode("setup_token")}
              disabled={isBusy}
            >
              I have Claude subscription
            </button>
          </div>
        ) : null}

        {authMode === "api_key" ? (
          <>
            <div className="UiApiKeyTitle">Enter {meta.name} API Key</div>
            <div className="UiApiKeySubtitle">
              {meta.helpText}{" "}
              {meta.helpUrl ? (
                <a
                  href={meta.helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="UiLink"
                  onClick={(e) => {
                    e.preventDefault();
                    const url = meta.helpUrl;
                    if (!url) {
                      return;
                    }
                    openExternal(url);
                  }}
                >
                  Get API key ↗
                </a>
              ) : null}
            </div>

            <div className="UiApiKeyInputRow">
              <TextInput
                type="password"
                value={apiKey}
                onChange={setApiKey}
                placeholder={meta.placeholder}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={isBusy}
                label={meta.name + " API key"}
                isError={errorText}
              />
            </div>
          </>
        ) : (
          <>
            <div className="UiApiKeyTitle">Paste Claude Setup Token</div>
            <div className="UiApiKeySubtitle">
              Run <code className="UiInlineCode">claude setup-token</code> in your terminal, then
              paste the generated token below.{" "}
              <a
                href="https://docs.anthropic.com/en/docs/claude-code/setup-token"
                target="_blank"
                rel="noopener noreferrer"
                className="UiLink"
                onClick={(e) => {
                  e.preventDefault();
                  openExternal("https://docs.anthropic.com/en/docs/claude-code/setup-token");
                }}
              >
                Learn more ↗
              </a>
            </div>

            <div className="UiApiKeyInputRow">
              <TextInput
                type="password"
                value={setupToken}
                onChange={setSetupToken}
                placeholder="sk-ant-oat01-..."
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={isBusy}
                label="Anthropic setup token"
                isError={errorText}
              />
            </div>
          </>
        )}

        <div className="UiApiKeySpacer" aria-hidden="true" />

        <div className="UiApiKeyButtonRow">
          <div />
          <PrimaryButton size="sm" disabled={isBusy} loading={validating} onClick={handleSubmit}>
            {validating ? "Validating…" : props.busy ? "Saving…" : "Continue"}
          </PrimaryButton>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
