import React, { useEffect } from "react";

import {
  GlassCard,
  HeroPageLayout,
  OnboardingDots,
  PrimaryButton,
  SecondaryButton,
} from "@shared/kit";
import {
  type ModelEntry,
  TIER_INFO,
  formatModelMeta,
  getModelTier,
} from "@shared/models/modelPresentation";

export function ModelSelectPage(props: {
  totalSteps: number;
  activeStep: number;
  models: ModelEntry[];
  filterProvider?: string;
  defaultModelId?: string;
  loading: boolean;
  error: string | null;
  onSelect: (modelId: string) => void;
  onBack: () => void;
  onRetry: () => void;
  onSkip?: () => void;
}) {
  const [selected, setSelected] = React.useState<string | null>(null);

  const filteredModels = React.useMemo(() => {
    let models = props.models;
    if (props.filterProvider) {
      models = models.filter((m) => m.provider === props.filterProvider);
    }
    const pinId = props.defaultModelId;
    const TIER_RANK: Record<string, number> = { ultra: 0, pro: 1, fast: 2 };
    return models.slice().sort((a, b) => {
      if (pinId) {
        const aPin = a.id.includes(pinId) ? 1 : 0;
        const bPin = b.id.includes(pinId) ? 1 : 0;
        if (aPin !== bPin) return bPin - aPin;
      }
      const tierA = getModelTier(a);
      const tierB = getModelTier(b);
      const aRank = tierA ? (TIER_RANK[tierA] ?? 99) : 99;
      const bRank = tierB ? (TIER_RANK[tierB] ?? 99) : 99;
      if (aRank !== bRank) return aRank - bRank;
      return a.name.localeCompare(b.name);
    });
  }, [props.models, props.filterProvider, props.defaultModelId]);

  useEffect(() => {
    if (filteredModels.length > 0) {
      const model = filteredModels[0];
      setSelected(`${model.provider}/${model.id}`);
    }
  }, [filteredModels]);

  if (props.loading) {
    return (
      <HeroPageLayout variant="compact" align="center" aria-label="Model selection">
        <GlassCard className="UiModelCard UiGlassCardOnboarding">
          <OnboardingDots totalSteps={props.totalSteps} activeStep={props.activeStep} />
          <div className="UiSectionTitle">Select AI Model</div>
          <div className="UiSectionSubtitle">
            Fetching available models from your configured provider.
          </div>
        </GlassCard>
      </HeroPageLayout>
    );
  }

  if (props.error) {
    return (
      <HeroPageLayout variant="compact" align="center" aria-label="Model selection">
        <GlassCard className="UiModelCard UiGlassCardOnboarding">
          <OnboardingDots totalSteps={props.totalSteps} activeStep={props.activeStep} />
          <div className="UiSectionTitle">Select AI Model</div>
          <div className="UiSectionSubtitle">Failed to load models.</div>
          <div className="UiModelBottomRow">
            <button className="UiTextButton" onClick={props.onBack}>
              Back
            </button>
            <PrimaryButton onClick={props.onRetry}>Retry</PrimaryButton>
          </div>
        </GlassCard>
      </HeroPageLayout>
    );
  }

  if (filteredModels.length === 0) {
    return (
      <HeroPageLayout variant="compact" align="center" aria-label="Model selection">
        <GlassCard className="UiModelCard UiGlassCardOnboarding">
          <OnboardingDots totalSteps={props.totalSteps} activeStep={props.activeStep} />
          <div className="UiSectionTitle">Select AI Model</div>
          <div className="UiSectionSubtitle">
            No models were found for your configured API key. The key may be invalid or the provider
            may be temporarily unavailable.
          </div>
          <div className="UiModelBottomRow">
            <button className="UiTextButton" onClick={props.onBack}>
              Back
            </button>
            <PrimaryButton onClick={props.onRetry}>Retry</PrimaryButton>
          </div>
        </GlassCard>
      </HeroPageLayout>
    );
  }

  return (
    <HeroPageLayout variant="compact" align="center" aria-label="Model selection">
      <GlassCard className="UiModelCard UiGlassCardOnboarding">
        <OnboardingDots totalSteps={props.totalSteps} activeStep={props.activeStep} />
        <div className="UiSectionTitle">Select AI Model</div>
        <div className="UiSectionSubtitle">
          Choose your preferred model. You can change this later in settings.
        </div>
        <div className="UiProviderList UiListWithScroll scrollable">
          {filteredModels.map((model) => {
            const modelKey = `${model.provider}/${model.id}`;
            const tier = getModelTier(model);
            const meta = formatModelMeta(model);
            return (
              <label
                key={modelKey}
                className={`UiProviderOption ${selected === modelKey ? "UiProviderOption--selected" : ""}`}
              >
                <input
                  type="radio"
                  name="model"
                  value={modelKey}
                  checked={selected === modelKey}
                  onChange={() => setSelected(modelKey)}
                  className="UiProviderRadio"
                />
                <div className="UiProviderContent">
                  <div className="UiProviderHeader">
                    <span className="UiProviderName">{model.name || model.id}</span>
                    {tier ? (
                      <span className={`UiProviderBadge UiModelTierBadge--${tier}`}>
                        {TIER_INFO[tier].label}
                      </span>
                    ) : null}
                  </div>
                  {meta ? <div className="UiProviderDescription">{meta}</div> : null}
                </div>
              </label>
            );
          })}
        </div>
        <div className="UiProviderContinueRow">
          <button className="UiTextButton" onClick={props.onBack}>
            Back
          </button>
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
