import React from "react";

import { ButtonRow, GlassCard, HeroPageLayout, InlineError, PrimaryButton } from "../kit";

export type Provider = "anthropic" | "google" | "openai" | "openrouter" | "zai" | "minimax";

type ProviderInfo = {
  id: Provider;
  name: string;
  description: string;
  recommended?: boolean;
};

const PROVIDER_ICONS: Record<Provider, string> = {
  anthropic: "anthropic.svg",
  openai: "opeanai.svg",
  google: "gemini.svg",
  minimax: "minimax.svg",
  zai: "zai.svg",
  openrouter: "openrouter.svg",
};

function resolveProviderIconUrl(provider: Provider): string {
  // Resolve relative to renderer's index.html (renderer/dist/index.html -> ../../assets/)
  return new URL(`../../assets/ai-providers/${PROVIDER_ICONS[provider]}`, document.baseURI).toString();
}

const PROVIDERS: ProviderInfo[] = [
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    description: "Claude models with excellent reasoning, coding, and instruction-following capabilities.",
    recommended: true,
  },
  {
    id: "google",
    name: "Google (Gemini)",
    description: "Gemini models with strong multimodal understanding and large context windows.",
  },
  {
    id: "openai",
    name: "OpenAI (GPT)",
    description: "GPT models with broad capabilities and extensive tool use support.",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Access to 200+ models from multiple providers through a single API.",
  },
  {
    id: "zai",
    name: "Z.ai (GLM)",
    description: "Budget-friendly models built for efficient, scalable AI workloads.",
  },
  {
    id: "minimax",
    name: "MiniMax",
    description: "Models designed for strong conversational AI and creative generation.",
  },
];

export function ProviderSelectPage(props: {
  error: string | null;
  onSelect: (provider: Provider) => void;
}) {
  const [selected, setSelected] = React.useState<Provider | null>(null);
  const totalSteps = 5;
  const activeStep = 0;

  return (
    <HeroPageLayout variant="compact" align="center" aria-label="Provider selection">
      <GlassCard>
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
        <div className="UiSectionTitle">Select AI Provider</div>
        <div className="UiSectionSubtitle">
          Choose your preferred AI provider. You can configure additional providers later.
        </div>
        {props.error ? <InlineError>{props.error}</InlineError> : null}
        <div className="UiProviderList">
          {PROVIDERS.map((provider) => (
            <label
              key={provider.id}
              className={`UiProviderOption ${selected === provider.id ? "UiProviderOption--selected" : ""}`}
            >
              <input
                type="radio"
                name="provider"
                value={provider.id}
                checked={selected === provider.id}
                onChange={() => setSelected(provider.id)}
                className="UiProviderRadio"
              />
              <span className="UiProviderIconWrap" aria-hidden="true">
                <img className="UiProviderIcon" src={resolveProviderIconUrl(provider.id)} alt="" />
              </span>
              <div className="UiProviderContent">
                <div className="UiProviderHeader">
                  <span className="UiProviderName">{provider.name}</span>
                  {provider.recommended && <span className="UiProviderBadge">Popular</span>}
                </div>
                <div className="UiProviderDescription">{provider.description}</div>
              </div>
            </label>
          ))}
        </div>
        <div className="UiProviderContinueRow">
          <PrimaryButton disabled={!selected} onClick={() => selected && props.onSelect(selected)}>
            Continue
          </PrimaryButton>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
