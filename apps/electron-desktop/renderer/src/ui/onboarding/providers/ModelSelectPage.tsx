import React, { useEffect } from "react";
import { GlassCard, HeroPageLayout, OnboardingDots, PrimaryButton } from "@shared/kit";
import {
  type ModelEntry,
  getModelTier,
  formatModelMeta,
  TIER_INFO,
} from "@shared/models/modelPresentation";
import layoutStyles from "../OnboardingStepLayout.module.css";
import s from "./ModelSelectPage.module.css";
import { RichSelect, type RichOption } from "@ui/settings/account-models/RichSelect";

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

  const modelOptions: RichOption<string>[] = React.useMemo(
    () =>
      filteredModels.map((m) => {
        const tier = getModelTier(m);
        const meta = formatModelMeta(m);
        const badge = tier ? { text: TIER_INFO[tier].label, variant: tier } : undefined;
        return {
          value: `${m.provider}/${m.id}`,
          label: m.name,
          meta: meta ?? undefined,
          badge,
        };
      }),
    [filteredModels]
  );

  useEffect(() => {
    if (filteredModels.length > 0) {
      const pinId = props.defaultModelId;
      const preferred = pinId
        ? filteredModels.find((m) => m.id === pinId || m.id.includes(pinId))
        : null;
      const model = preferred ?? filteredModels[0]!;
      setSelected(`${model.provider}/${model.id}`);
    }
  }, [filteredModels, props.defaultModelId]);

  if (props.loading) {
    return (
      <HeroPageLayout
        variant="compact"
        align="center"
        aria-label="Model selection"
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
        <GlassCard className="UiModelCard UiGlassCardOnboarding">
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
      <HeroPageLayout
        variant="compact"
        align="center"
        aria-label="Model selection"
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
          <div className={layoutStyles.UiSetupHeaderRight} />
        </div>
        <GlassCard className="UiModelCard UiGlassCardOnboarding">
          <div className="UiSectionTitle">Select AI Model</div>
          <div className="UiSectionSubtitle">Failed to load models.</div>
          <div className="UiModelBottomRow">
            <div />
            <PrimaryButton onClick={props.onRetry}>Retry</PrimaryButton>
          </div>
        </GlassCard>
      </HeroPageLayout>
    );
  }

  if (filteredModels.length === 0) {
    return (
      <HeroPageLayout
        variant="compact"
        align="center"
        aria-label="Model selection"
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
          <div className={layoutStyles.UiSetupHeaderRight} />
        </div>
        <GlassCard className="UiModelCard UiGlassCardOnboarding">
          <div className="UiSectionTitle">Select AI Model</div>
          <div className="UiSectionSubtitle">
            No models were found for your configured API key. The key may be invalid or the provider
            may be temporarily unavailable.
          </div>
          <div className="UiModelBottomRow">
            <div />
            <PrimaryButton onClick={props.onRetry}>Retry</PrimaryButton>
          </div>
        </GlassCard>
      </HeroPageLayout>
    );
  }

  return (
    <HeroPageLayout
      variant="compact"
      align="center"
      aria-label="Model selection"
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
        <div className={layoutStyles.UiSetupHeaderRight}>
          {props.onSkip ? (
            <button className="UiTextButton" type="button" onClick={props.onSkip}>
              Skip
            </button>
          ) : null}
        </div>
      </div>
      <GlassCard className="UiModelCard UiGlassCardOnboarding">
        <div className="UiSectionTitle">Select AI Model</div>
        <div className="UiSectionSubtitle">
          Choose your preferred model. You can change this later in settings.
        </div>
        <div className={s.dropdownWrap}>
          <span className={s.dropdownLabel}>Current Model</span>
          <RichSelect
            value={selected}
            onChange={(value) => setSelected(value)}
            options={modelOptions}
            placeholder={modelOptions.length === 0 ? "No models available" : "Select model…"}
            disabled={modelOptions.length === 0}
            disabledStyles={modelOptions.length === 0}
          />
        </div>
        <p className={s.footnote}>Different models may consume different amounts of AI credits.</p>

        <div className="UiApiKeySpacer" aria-hidden="true" />
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
