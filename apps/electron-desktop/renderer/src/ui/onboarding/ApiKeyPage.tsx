import React from "react";

import { GlassCard, HeroPageLayout, InlineError, PrimaryButton, TextInput } from "../kit";
import type { Provider } from "./ProviderSelectPage";

type ProviderMeta = {
  placeholder: string;
  helpUrl?: string;
  helpText?: string;
};

const PROVIDER_META: Record<Provider, ProviderMeta> = {
  anthropic: {
    placeholder: "sk-ant-...",
    helpUrl: "https://console.anthropic.com/settings/keys",
    helpText: "Get your API key from the Anthropic Console.",
  },
  google: {
    placeholder: "AIza...",
    helpUrl: "https://aistudio.google.com/apikey",
    helpText: "Get your API key from Google AI Studio.",
  },
  openai: {
    placeholder: "sk-...",
    helpUrl: "https://platform.openai.com/api-keys",
    helpText: "Get your API key from the OpenAI Platform.",
  },
  openrouter: {
    placeholder: "sk-or-...",
    helpUrl: "https://openrouter.ai/keys",
    helpText: "Get your API key from OpenRouter.",
  },
  zai: {
    placeholder: "sk-...",
    helpUrl: "https://z.ai/manage-apikey/apikey-list",
    helpText: "Get your API key from the Z.AI Platform.",
  },
  minimax: {
    placeholder: "sk-...",
    helpUrl: "https://platform.minimax.io/user-center/basic-information/interface-key",
    helpText: "Get your API key from the MiniMax Platform.",
  },
};

export function ApiKeyPage(props: {
  provider: Provider;
  status: string | null;
  error: string | null;
  busy: boolean;
  onSubmit: (apiKey: string) => void;
  onBack: () => void;
}) {
  const [apiKey, setApiKey] = React.useState("");
  const meta = PROVIDER_META[props.provider];
  const totalSteps = 5;
  const activeStep = 1;

  const handleSubmit = () => {
    const trimmed = apiKey.trim();
    if (trimmed) {
      props.onSubmit(trimmed);
    }
  };

  return (
    <HeroPageLayout variant="compact" align="center" aria-label="API key setup">
      <GlassCard className="UiApiKeyCard">
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

        <div className="UiApiKeyTitle">Enter API Key</div>
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
                window.openclawDesktop?.openExternal(meta.helpUrl!);
              }}
            >
              Get API key ↗
            </a>
          ) : null}
        </div>

        {props.status ? <div className="UiSectionSubtitle">{props.status}</div> : null}
        {props.error ? <InlineError>{props.error}</InlineError> : null}

        <div className="UiApiKeyInputRow">
          <TextInput
            type="password"
            value={apiKey}
            onChange={setApiKey}
            placeholder={meta.placeholder}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={props.busy}
          />
        </div>

        <div className="UiApiKeySpacer" aria-hidden="true" />

        <div className="UiApiKeyButtonRow">
          <button className="UiTextButton" disabled={props.busy} onClick={props.onBack} type="button">
            Back
          </button>
          <PrimaryButton disabled={!apiKey.trim() || props.busy} onClick={handleSubmit}>
            {props.busy ? "Saving..." : "Continue"}
          </PrimaryButton>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
