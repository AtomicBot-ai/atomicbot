import React, { useEffect } from "react";

import {
  GlassCard,
  HeroPageLayout,
  OnboardingDots,
  PrimaryButton,
  SecondaryButton,
} from "@shared/kit";

import {
  MODEL_PROVIDERS,
  type ModelProvider,
  resolveProviderIconUrl,
} from "@shared/models/providers";

export type Provider = ModelProvider;

export function ProviderSelectPage(props: {
  totalSteps: number;
  activeStep: number;
  error: string | null;
  onSelect: (provider: Provider) => void;
  selectedProvider: Provider | null;
  onBack?: () => void;
  onSkip?: () => void;
}) {
  const [selected, setSelected] = React.useState<Provider | null>(
    props.selectedProvider ? props.selectedProvider : null
  );

  useEffect(() => {
    if (!selected) {
      setSelected(MODEL_PROVIDERS[0].id);
    }
  }, []);

  return (
    <HeroPageLayout variant="compact" align="center" aria-label="Provider selection">
      <GlassCard className="UiProviderCard UiGlassCardOnboarding">
        <OnboardingDots totalSteps={props.totalSteps} activeStep={props.activeStep} />

        <div className="UiSectionTitle">Choose AI Provider</div>
        <div className="UiSectionSubtitle">
          Pick the AI provider you want to start with. You can switch or add more providers later.
        </div>

        <div className="UiProviderList UiListWithScroll scrollable">
          {MODEL_PROVIDERS.map((provider) => (
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
                  {provider.recommended && <span className="UiProviderBadge">Recommended</span>}
                  {provider.popular && <span className="UiProviderBadgePopular">Popular</span>}
                  {provider.privacyFirst && (
                    <span className="UiProviderBadgePrivacy">Privacy First</span>
                  )}
                </div>
                <div className="UiProviderDescription">{provider.description}</div>
              </div>
            </label>
          ))}
        </div>
        <div className="UiProviderContinueRow">
          <div>
            {props.onBack ? (
              <button className="UiTextButton" type="button" onClick={props.onBack}>
                Back
              </button>
            ) : null}
          </div>
          <div className="UiSkillsBottomActions">
            {props.onSkip ? (
              <SecondaryButton size={"sm"} onClick={props.onSkip}>
                Skip
              </SecondaryButton>
            ) : null}
            <PrimaryButton
              size={"sm"}
              disabled={!selected}
              onClick={() => selected && props.onSelect(selected)}
            >
              Continue
            </PrimaryButton>
          </div>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
