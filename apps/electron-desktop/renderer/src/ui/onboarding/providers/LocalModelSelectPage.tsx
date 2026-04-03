import React from "react";

import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  fetchLlamacppModels,
  fetchLlamacppSystemInfo,
  downloadLlamacppModel,
  cancelLlamacppModelDownload,
} from "@store/slices/llamacppSlice";
import { GlassCard, HeroPageLayout, PrimaryButton, Modal } from "@shared/kit";
import { addToastError } from "@shared/toast";
import { useOnboardingStepEvent } from "@analytics/use-onboarding-step-event";
import { OnboardingHeader } from "../OnboardingHeader";
import qwenIcon from "@assets/ai-models/qwen.svg";
import glmIcon from "@assets/ai-models/glm.svg";
import nvidiaIcon from "@assets/ai-models/nvidia.svg";
import googleIcon from "@assets/ai-models/google.svg";
import s from "./LocalModelSelectPage.module.css";

export function LocalModelSelectPage(props: {
  totalSteps: number;
  activeStep: number;
  onSelect: (modelId: string) => Promise<void>;
  onContinue: () => void;
  onBack: () => void;
}) {
  useOnboardingStepEvent("local_model_select", "local-model");
  const dispatch = useAppDispatch();
  const models = useAppSelector((st) => st.llamacpp.models);
  const systemInfo = useAppSelector((st) => st.llamacpp.systemInfo);
  const modelDownload = useAppSelector((st) => st.llamacpp.modelDownload);
  const [selectingModelId, setSelectingModelId] = React.useState<string | null>(null);
  const [unsupportedModalOpen, setUnsupportedModalOpen] = React.useState(false);

  React.useEffect(() => {
    void dispatch(fetchLlamacppModels());
    void dispatch(fetchLlamacppSystemInfo());
  }, [dispatch]);

  const downloadingModelId = modelDownload.kind === "downloading" ? modelDownload.modelId : null;

  const handleSelect = React.useCallback(
    async (modelId: string) => {
      setSelectingModelId(modelId);
      try {
        await props.onSelect(modelId);
      } catch (err) {
        addToastError(err);
      } finally {
        setSelectingModelId(null);
      }
    },
    [props]
  );

  const handleDownload = React.useCallback(
    (modelId: string) => {
      void (async () => {
        try {
          await dispatch(downloadLlamacppModel(modelId)).unwrap();
          await handleSelect(modelId);
        } catch {
          // Download errors are rendered inline by modelDownload state.
        }
      })();
    },
    [dispatch, handleSelect]
  );

  const handleCancel = React.useCallback(() => {
    void dispatch(cancelLlamacppModelDownload());
  }, [dispatch]);

  return (
    <HeroPageLayout variant="compact" align="center" aria-label="Local model selection">
      <OnboardingHeader
        totalSteps={props.totalSteps}
        activeStep={props.activeStep}
        onBack={props.onBack}
      />
      <GlassCard className={`UiProviderCard UiGlassCardOnboarding ${s.card}`}>
        <div className="UiSectionTitle">Choose a Model</div>
        <div className="UiSectionSubtitle">
          Select an AI model to run locally.
          {systemInfo && <> Your Mac has {systemInfo.totalRamGb} GB RAM.</>}
        </div>

        <div className={`UiProviderList UiListWithScroll scrollable ${s.modelList}`}>
          {models.map((model) => {
            const isDownloading = downloadingModelId === model.id;
            const isSelecting = selectingModelId === model.id;
            const actionsDisabled = selectingModelId !== null && !isSelecting;

            const iconMap: Record<string, string> = {
              qwen: qwenIcon,
              glm: glmIcon,
              nvidia: nvidiaIcon,
              google: googleIcon,
            };
            const iconSrc = iconMap[model.icon];

            return (
              <div key={model.id} className={s.modelRow}>
                {iconSrc && (
                  <div className={s.modelIcon}>
                    <img src={iconSrc} alt="" width={20} height={20} />
                  </div>
                )}
                <div className={s.modelInfo}>
                  <div className={s.modelName}>
                    {model.name}
                    {model.tag && (
                      <span
                        className={`${s.badge} ${model.tag === "Recommended" ? s.badgeRecommended : s.badgeHighPerformance}`}
                      >
                        {model.tag}
                      </span>
                    )}
                    {model.compatibility === "possible" && (
                      <span className={`${s.badge} ${s.badgePossible}`}>May be slow</span>
                    )}
                  </div>
                  <div className={s.modelMeta}>
                    {model.description} &middot; {model.sizeLabel} &middot; {model.contextLabel}
                  </div>
                </div>
                <div className={s.modelAction}>
                  {model.downloaded ? (
                    <button
                      type="button"
                      className="UiSkillConnectButton"
                      disabled={isSelecting || actionsDisabled}
                      onClick={() => void handleSelect(model.id)}
                    >
                      {isSelecting ? "Starting..." : "Select"}
                    </button>
                  ) : isDownloading ? (
                    <div className={s.downloadingRow}>
                      <span className={s.downloadingText}>
                        Downloading...{" "}
                        {modelDownload.kind === "downloading" ? `${modelDownload.percent}%` : ""}
                      </span>
                      <button
                        type="button"
                        className={s.cancelIcon}
                        onClick={handleCancel}
                        aria-label="Cancel download"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="UiSkillConnectButton"
                      disabled={actionsDisabled}
                      onClick={() => {
                        if (model.compatibility === "not-recommended") {
                          setUnsupportedModalOpen(true);
                          return;
                        }
                        handleDownload(model.id);
                      }}
                    >
                      Download
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {modelDownload.kind === "error" && (
          <div style={{ color: "var(--error)", fontSize: 13, marginTop: 8 }}>
            {modelDownload.message}
          </div>
        )}

        <div className="UiProviderContinueRow">
          <div />
          <div className="UiSkillsBottomActions">
            <PrimaryButton size="sm" onClick={props.onContinue}>
              Continue
            </PrimaryButton>
          </div>
        </div>
      </GlassCard>

      <Modal
        open={unsupportedModalOpen}
        onClose={() => setUnsupportedModalOpen(false)}
        header="Unsupported Hardware"
      >
        <p style={{ color: "var(--muted3)", fontSize: 14 }}>
          Model is not supported on your hardware. Your system does not have enough RAM to run this
          model.
        </p>
      </Modal>
    </HeroPageLayout>
  );
}
