import React, { useState } from "react";

import { GlassCard, HeroPageLayout, PrimaryButton, TextInput } from "../kit";
import type { Provider } from "./ProviderSelectPage";
import { MODEL_PROVIDER_BY_ID } from "../models/providers";

export function ApiKeyPage(props: {
  provider: Provider;
  status: string | null;
  error: string | null;
  busy: boolean;
  onSubmit: (apiKey: string) => void;
  onBack: () => void;
}) {
  const [apiKey, setApiKey] = React.useState("");
  const meta = MODEL_PROVIDER_BY_ID[props.provider];
  const totalSteps = 5;
  const activeStep = 1;
  const [errorText, setErrorText] = useState("");
  const [validating, setValidating] = useState(false);

  const handleSubmit = async () => {
    if (errorText) {
      setErrorText("");
    }
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setErrorText("Please enter your API key to continue");
      return;
    }

    // Validate the key against the provider API before saving
    setValidating(true);
    try {
      const result = await window.openclawDesktop?.validateApiKey(props.provider, trimmed);
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

  const isBusy = props.busy || validating;

  return (
    <HeroPageLayout variant="compact" align="center" aria-label="API key setup">
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
                void window.openclawDesktop?.openExternal(url);
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

        <div className="UiApiKeySpacer" aria-hidden="true" />

        <div className="UiApiKeyButtonRow">
          <button
            className="UiTextButton"
            disabled={isBusy}
            onClick={props.onBack}
            type="button"
          >
            Back
          </button>
          <PrimaryButton
            size={"sm"}
            disabled={isBusy}
            loading={validating}
            onClick={() => void handleSubmit()}
          >
            {validating ? "Validating…" : props.busy ? "Saving…" : "Continue"}
          </PrimaryButton>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
