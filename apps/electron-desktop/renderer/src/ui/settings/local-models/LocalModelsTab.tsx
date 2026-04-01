import React from "react";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  fetchLlamacppModels,
  fetchLlamacppSystemInfo,
  fetchLlamacppBackendStatus,
  fetchLlamacppServerStatus,
  downloadLlamacppBackend,
  checkLlamacppBackendUpdate,
  downloadLlamacppModel,
  cancelLlamacppModelDownload,
  setLlamacppActiveModel,
  deleteLlamacppModel,
  warmupLocalModel,
  llamacppActions,
} from "@store/slices/llamacppSlice";
import { applyLocalModelConfig } from "@store/slices/llamacpp-config";
import { resetSessionModelSelection } from "@store/slices/session-model-reset";
import { reloadConfig } from "@store/slices/configSlice";
import { SecondaryButton, Modal, ConfirmDialog } from "@shared/kit";
import qwenIcon from "@assets/ai-models/qwen.svg";
import glmIcon from "@assets/ai-models/glm.svg";
import nvidiaIcon from "@assets/ai-models/nvidia.svg";
import s from "./LocalModelsTab.module.css";

type GatewayRequest = <T = unknown>(method: string, params?: unknown) => Promise<T>;

export function LocalModelsTab(props: {
  gatewayRequest?: GatewayRequest;
  onReload?: () => Promise<void>;
  onSwitchToLocalMode?: () => Promise<void>;
}) {
  const dispatch = useAppDispatch();
  const { backendDownloaded, models, modelDownload, activeModelId, systemInfo } = useAppSelector(
    (st) => st.llamacpp
  );

  const autoStartedRef = React.useRef(false);
  const [selectingModelId, setSelectingModelId] = React.useState<string | null>(null);
  const [unsupportedModalOpen, setUnsupportedModalOpen] = React.useState(false);
  const [deleteConfirmModelId, setDeleteConfirmModelId] = React.useState<string | null>(null);
  const [deletingModelId, setDeletingModelId] = React.useState<string | null>(null);

  React.useEffect(() => {
    void dispatch(fetchLlamacppModels());
    void dispatch(fetchLlamacppSystemInfo());
    void dispatch(fetchLlamacppServerStatus());

    void (async () => {
      const status = await dispatch(fetchLlamacppBackendStatus()).unwrap();
      if (autoStartedRef.current) return;
      autoStartedRef.current = true;

      if (!status?.downloaded) {
        void dispatch(downloadLlamacppBackend());
      } else {
        const update = await dispatch(checkLlamacppBackendUpdate()).unwrap();
        if (update?.updateAvailable) {
          void dispatch(downloadLlamacppBackend());
        }
      }
    })();
  }, [dispatch]);

  const downloadingModelId = modelDownload.kind === "downloading" ? modelDownload.modelId : null;

  const handleSelect = React.useCallback(
    async (modelId: string) => {
      console.log("[LocalModelsTab] handleSelect:", modelId);
      setSelectingModelId(modelId);

      try {
        if (props.onSwitchToLocalMode) {
          await props.onSwitchToLocalMode();
        }

        const serverResult = await dispatch(setLlamacppActiveModel(modelId)).unwrap();
        console.log("[LocalModelsTab] setActiveModel result:", serverResult);
        void dispatch(fetchLlamacppServerStatus());

        const cfgModelId = serverResult?.modelId ?? modelId;
        const cfgModelName = serverResult?.modelName ?? "Local Model";

        if (props.gatewayRequest) {
          await applyLocalModelConfig({
            request: props.gatewayRequest,
            modelId: cfgModelId,
            modelName: cfgModelName,
            contextLength: serverResult?.contextLength,
          });
          await resetSessionModelSelection(props.gatewayRequest);
          console.log(`[LocalModelsTab] config.apply OK: llamacpp/${cfgModelId} set as default`);
          void dispatch(warmupLocalModel(props.gatewayRequest));

          if (props.onReload) {
            await props.onReload().catch(() => {});
          } else {
            await dispatch(reloadConfig({ request: props.gatewayRequest }))
              .unwrap()
              .catch(() => {});
          }
        }
      } catch (err) {
        console.error("[LocalModelsTab] handleSelect failed:", err);
      } finally {
        setSelectingModelId(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when specific prop methods change
    [dispatch, props.gatewayRequest, props.onReload, props.onSwitchToLocalMode]
  );

  const handleDelete = React.useCallback(
    async (modelId: string) => {
      setDeletingModelId(modelId);
      setDeleteConfirmModelId(null);
      try {
        await dispatch(deleteLlamacppModel(modelId)).unwrap();
      } catch (err) {
        console.error("[LocalModelsTab] delete failed:", err);
      } finally {
        setDeletingModelId(null);
      }
    },
    [dispatch]
  );

  return (
    <div className={s.root}>
      {/* System info */}
      {systemInfo && (
        <div className={s.systemInfo}>
          {systemInfo.totalRamGb} GB RAM &middot;{" "}
          {systemInfo.isAppleSilicon ? "Apple Silicon" : systemInfo.arch}
        </div>
      )}

      {/* Model list */}
      <div className={s.modelList}>
        {models.map((model) => {
          const isActive = activeModelId === model.id;
          const isDownloading = downloadingModelId === model.id;
          const isSelecting = selectingModelId === model.id;
          const isDeleting = deletingModelId === model.id;

          return (
            <div key={model.id} className={`${s.modelRow} ${isActive ? s.modelRowActive : ""}`}>
              <div className={s.modelIcon}>
                <ModelIcon icon={model.icon} />
              </div>
              <div className={s.modelInfo}>
                <div className={s.modelName}>
                  {model.name}
                  {model.tag && (
                    <span
                      className={`${s.tagBadge} ${model.tag === "Recommended" ? s.tagRecommended : s.tagHighPerformance}`}
                    >
                      {model.tag}
                    </span>
                  )}
                  {model.compatibility === "possible" && (
                    <span className={`${s.activeBadge} ${s.compatPossible}`}>May be slow</span>
                  )}
                </div>
                <div className={s.modelMeta}>
                  {model.description} &middot; {model.sizeLabel} &middot; {model.contextLabel}
                </div>

                {isDownloading && modelDownload.kind === "downloading" && (
                  <div className={s.downloadProgress}>
                    <div className={s.downloadRow}>
                      <div className={s.downloadLabel}>Downloading… {modelDownload.percent}%</div>
                      <button
                        type="button"
                        className={s.cancelBtn}
                        onClick={() => void dispatch(cancelLlamacppModelDownload())}
                        aria-label="Cancel download"
                      >
                        ✕
                      </button>
                    </div>
                    <div className={s.downloadTrack}>
                      <div
                        className={s.downloadFill}
                        style={{ width: `${modelDownload.percent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className={s.modelAction}>
                {model.downloaded ? (
                  isActive ? (
                    <span className={s.activeLabel}>Active</span>
                  ) : (
                    <div className={s.actionGroup}>
                      <button
                        type="button"
                        className={s.deleteBtn}
                        disabled={isDeleting}
                        onClick={() => setDeleteConfirmModelId(model.id)}
                        aria-label="Delete model"
                        title="Delete model"
                      >
                        <TrashIcon />
                      </button>
                      <SecondaryButton
                        size="sm"
                        disabled={isSelecting || selectingModelId !== null || isDeleting}
                        onClick={() => void handleSelect(model.id)}
                      >
                        {isSelecting ? "Starting…" : "Activate"}
                      </SecondaryButton>
                    </div>
                  )
                ) : isDownloading ? null : (
                  <SecondaryButton
                    size="sm"
                    onClick={() => {
                      if (model.compatibility === "not-recommended") {
                        setUnsupportedModalOpen(true);
                        return;
                      }
                      void dispatch(downloadLlamacppModel(model.id));
                    }}
                    disabled={!backendDownloaded || downloadingModelId !== null}
                  >
                    Download
                  </SecondaryButton>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Model download error */}
      {modelDownload.kind === "error" && (
        <div className={s.downloadError}>
          <span>Download failed: {modelDownload.message}</span>
          <button
            type="button"
            className={s.cancelBtn}
            onClick={() => dispatch(llamacppActions.setModelDownload({ kind: "idle" }))}
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

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

      <ConfirmDialog
        open={deleteConfirmModelId !== null}
        title="Delete this model?"
        subtitle="The model file will be removed from disk. You can re-download it later."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onConfirm={() => {
          if (deleteConfirmModelId) void handleDelete(deleteConfirmModelId);
        }}
        onCancel={() => setDeleteConfirmModelId(null)}
      />
    </div>
  );
}

const MODEL_ICON_MAP: Record<string, string> = {
  qwen: qwenIcon,
  glm: glmIcon,
  nvidia: nvidiaIcon,
};

function ModelIcon({ icon }: { icon: string }) {
  const src = MODEL_ICON_MAP[icon];

  if (!src) {
    return <div className={s.modelIconFallback}>{icon.charAt(0).toUpperCase()}</div>;
  }

  return (
    <div className={s.modelIconBox}>
      <img src={src} alt="" width={20} height={20} />
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
