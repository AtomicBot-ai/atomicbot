import React, { useEffect } from "react";

import { GlassCard, HeroPageLayout, PrimaryButton } from "@shared/kit";
import { useOnboardingStepEvent } from "@analytics/use-onboarding-step-event";
import { OnboardingHeader } from "../OnboardingHeader";

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
  useOnboardingStepEvent("provider_select", "self-managed");
  const [selected, setSelected] = React.useState<Provider | null>(
    props.selectedProvider ? props.selectedProvider : null
  );

  useEffect(() => {
    if (!selected) {
      setSelected(MODEL_PROVIDERS[0].id);
    }
  }, [selected]);

  return (
    <HeroPageLayout
      variant="compact"
      align="center"
      aria-label="Provider selection"
      context="onboarding"
    >
      <OnboardingHeader
        totalSteps={props.totalSteps}
        activeStep={props.activeStep}
        onBack={props.onBack}
        onSkip={props.onSkip}
      />
      <GlassCard className="UiProviderCard UiGlassCardOnboarding">
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
                  {provider.localModels && (
                    <span className="UiProviderBadgeLocal">Local models</span>
                  )}
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
          <div />
          <div className="UiSkillsBottomActions">
            <PrimaryButton
              size="sm"
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
