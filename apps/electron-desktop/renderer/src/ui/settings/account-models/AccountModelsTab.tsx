/**
 * Unified "AI Models" settings tab.
 * Shows a Connection toggle (paid / self-managed) at the top,
 * then Provider/Model selectors, and mode-specific content below:
 *   - paid: AccountTab billing/balance content
 *   - self-managed: inline API key entry
 *
 * @deprecated Scheduled for removal.
 */
import React, { useState } from "react";

import { useAppDispatch, useAppSelector } from "@store/hooks";
import type { SetupMode } from "@store/slices/auth/authSlice";
import { switchMode } from "@store/slices/auth/mode-switch";
import type { ConfigData } from "@store/slices/configSlice";
import { addToast, addToastError } from "@shared/toast";

import {
  MODEL_PROVIDERS,
  MODEL_PROVIDER_BY_ID,
  type ModelProvider,
  resolveProviderIconUrl,
  getProviderIconUrl,
} from "@shared/models/providers";
import { getModelTier, formatModelMeta, TIER_INFO } from "@shared/models/modelPresentation";
import { getDefaultModelPrimary } from "../providers/configParsing";
import { useModelProvidersState } from "../providers/useModelProvidersState";
import { AccountTab } from "../account/AccountTab";
import { RichSelect, type RichOption } from "./RichSelect";
import { InlineApiKey } from "./InlineApiKey";
import { useAccountState } from "@ui/settings/account/useAccountState";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { openExternal } from "@shared/utils/openExternal";
import { LocalModelsTab } from "../local-models/LocalModelsTab";
import { fetchLlamacppServerStatus } from "@store/slices/llamacppSlice";

import s from "./AccountModelsTab.module.css";

type GatewayRpc = {
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  connected?: boolean;
};

type ConfigSnapshotLike = {
  hash?: string;
  config?: ConfigData;
};

function providerBadge(p: (typeof MODEL_PROVIDERS)[number]):
  | {
      text: string;
      variant: string;
    }
  | undefined {
  if (p.recommended) return { text: "Recommended", variant: "recommended" };
  if (p.popular) return { text: "Popular", variant: "popular" };
  if (p.localModels) return { text: "Local models", variant: "local" };
  if (p.privacyFirst) return { text: "Privacy First", variant: "privacy" };
  return undefined;
}

function ConnectionToggle(props: {
  activeMode: SetupMode | null;
  disabled: boolean;
  onSelect: (mode: SetupMode) => void;
  showLocalModels?: boolean;
}) {
  const active = props.activeMode;
  return (
    <div className={s.connectionSection}>
      <div className={s.connectionSelector} role="radiogroup" aria-label="Connection mode">
        <button
          type="button"
          className={`${s.connectionOption}${active === "paid" ? ` ${s["connectionOption--active"]}` : ""}`}
          onClick={() => void props.onSelect("paid")}
          disabled={props.disabled}
        >
          Subscription
        </button>
        <button
          type="button"
          className={`${s.connectionOption}${active === "self-managed" ? ` ${s["connectionOption--active"]}` : ""}`}
          onClick={() => void props.onSelect("self-managed")}
          disabled={props.disabled}
        >
          API keys
        </button>
        {props.showLocalModels && (
          <button
            type="button"
            className={`${s.connectionOption}${active === "local-model" ? ` ${s["connectionOption--active"]}` : ""}`}
            onClick={() => void props.onSelect("local-model")}
            disabled={props.disabled}
          >
            Local Models
          </button>
        )}
      </div>
    </div>
  );
}

const MODE_LABELS: Record<SetupMode, string> = {
  paid: "Subscription",
  "self-managed": "API keys",
  "local-model": "Local Models",
};

const SERVER_STATUS_LABELS: Record<string, string> = {
  stopped: "Stopped",
  starting: "Starting…",
  loading: "Loading model…",
  running: "Running",
  error: "Error",
};

/** OpenAI-compatible base URL for bundled llama.cpp (matches default local provider `baseUrl`). */
const LOCAL_MODELS_API_ENDPOINT = "http://127.0.0.1:18790/v1";

const LLAMACPP_PRIMARY_PREFIX = "llamacpp/";

/** Readable label when the catalog entry is not loaded yet (`provider/modelId`). */
function formatModelIdForStatusBar(rawId: string): string {
  const t = rawId.trim();
  const i = t.indexOf("/");
  if (i >= 0 && i < t.length - 1) {
    return t.slice(i + 1);
  }
  return t;
}

export function AccountModelsTab(props: {
  gw: GatewayRpc;
  configSnap: ConfigSnapshotLike | null;
  reload: () => Promise<void>;
  onError: (value: string | null) => void;
  noTitle?: boolean;
}) {
  const dispatch = useAppDispatch();
  const accountState = useAccountState();
  const authMode = useAppSelector((st) => st.auth.mode);
  const isPaidMode = authMode === "paid";
  const [tabMode, setTabMode] = useState<SetupMode | null>(authMode);
  const isMac = (getDesktopApiOrNull()?.platform ?? "darwin") === "darwin";

  const [modeSwitchBusy, setModeSwitchBusy] = React.useState(false);
  const { gw, reload, onError, configSnap, noTitle } = props;

  const state = useModelProvidersState({
    ...props,
    isPaidMode,
  });
  const {
    activeProviderKey,
    providerFilter,
    setProviderFilter,
    sortedModels,
    saveDefaultModel,
    activeModelId,
    activeModelEntry,
    isProviderConfigured,
    modelsLoading,
    modelBusy,
    busyProvider,
    saveProviderApiKey,
    saveProviderSetupToken,
    saveOllamaProvider,
    loadModels,
    pasteFromClipboard,
  } = state;

  const llamacpp = useAppSelector((st) => st.llamacpp);

  const configPrimaryModelId = React.useMemo(
    () => getDefaultModelPrimary(configSnap?.config),
    [configSnap?.config]
  );

  React.useEffect(() => {
    if (authMode === "local-model" || tabMode === "local-model") {
      void dispatch(fetchLlamacppServerStatus());
    }
  }, [authMode, tabMode, dispatch]);

  // Auto-select provider from current active model on first load (self-managed only)
  const autoSelectedRef = React.useRef(false);
  React.useEffect(() => {
    if (!isPaidMode && !autoSelectedRef.current && activeProviderKey && !providerFilter) {
      autoSelectedRef.current = true;
      setProviderFilter(activeProviderKey);
    }
  }, [activeProviderKey, isPaidMode, providerFilter, setProviderFilter]);

  const selectedProvider = providerFilter;
  const selectedProviderInfo = selectedProvider
    ? (MODEL_PROVIDER_BY_ID[selectedProvider] ?? null)
    : null;

  const providerOptions: RichOption<ModelProvider>[] = React.useMemo(
    () =>
      MODEL_PROVIDERS.map((p) => ({
        value: p.id,
        label: p.name,
        icon: resolveProviderIconUrl(p.id),
        description: p.description,
        badge: providerBadge(p),
      })),
    []
  );

  const isSelectedProviderConfigured = selectedProvider
    ? state.isProviderConfigured(selectedProvider)
    : false;

  const modelOptions: RichOption<string>[] = React.useMemo(() => {
    if (isPaidMode) {
      const TIER_RANK: Record<string, number> = { ultra: 0, pro: 1, fast: 2 };
      const withTiers = sortedModels
        .filter((m) => m.provider === "openrouter")
        .map((m) => ({
          model: m,
          tier: getModelTier(m),
        }));
      withTiers.sort((a, b) => {
        const aRank = a.tier ? (TIER_RANK[a.tier] ?? 99) : 99;
        const bRank = b.tier ? (TIER_RANK[b.tier] ?? 99) : 99;
        return aRank - bRank;
      });
      return withTiers.map(({ model: m, tier }) => {
        const meta = formatModelMeta(m);
        const badge = tier ? { text: TIER_INFO[tier].label, variant: tier } : undefined;
        return {
          value: `${m.provider}/${m.id}`,
          label: m.name,
          meta: meta ?? undefined,
          badge,
          icon: getProviderIconUrl(m.provider),
        };
      });
    }
    if (!selectedProvider) return [];
    return sortedModels
      .filter((m) => m.provider === selectedProvider)
      .map((m) => {
        const tier = getModelTier(m);
        const meta = formatModelMeta(m);
        const badge = tier ? { text: TIER_INFO[tier].label, variant: tier } : undefined;
        return {
          value: `${m.provider}/${m.id}`,
          label: m.name,
          meta: meta ?? undefined,
          badge,
          icon: getProviderIconUrl(m.provider),
        };
      });
  }, [isPaidMode, selectedProvider, sortedModels]);

  const handleProviderChange = React.useCallback(
    (value: ModelProvider) => {
      setProviderFilter(value);
    },
    [setProviderFilter]
  );

  const handleModelChange = React.useCallback(
    (value: string) => {
      void saveDefaultModel(value);
    },
    [saveDefaultModel]
  );

  // Auto-select first model when provider changes and current model doesn't belong to it.
  // Skip when in local-model mode — the local models tab manages its own primary model
  // via applyLocalModelConfig, and this effect would race with it by writing back
  // a stale self-managed model (e.g. anthropic) from the still-loaded model options.
  React.useEffect(() => {
    if (
      !isPaidMode &&
      authMode !== "local-model" &&
      selectedProvider &&
      modelOptions.length > 0 &&
      !modelOptions.some((opt) => opt.value === activeModelId)
    ) {
      handleModelChange(modelOptions[0]!.value);
    }
  }, [activeModelId, authMode, handleModelChange, isPaidMode, modelOptions, selectedProvider]);

  const handleOAuthSuccess = React.useCallback(() => {
    void reload();
  }, [reload]);

  const configHash = typeof configSnap?.hash === "string" ? configSnap.hash : null;

  // ── Mode switching ──

  const handleConnectionSelect = React.useCallback(
    async (mode: SetupMode) => {
      setTabMode(mode);

      if (mode === authMode) return;

      // Defer mode switch for local-model — happens on explicit Select
      if (mode === "local-model") return;

      setModeSwitchBusy(true);
      try {
        const result = await dispatch(switchMode({ request: gw.request, target: mode })).unwrap();

        let restoredProvider: ModelProvider | null = null;
        if (result?.restoredModel) {
          const idx = result.restoredModel.indexOf("/");
          restoredProvider = idx > 0 ? (result.restoredModel.slice(0, idx) as ModelProvider) : null;
        }

        if (mode === "self-managed" && !result?.hasBackup) {
          onError("No saved configuration found. Please set up your API keys.");
        }

        setProviderFilter(restoredProvider);
        autoSelectedRef.current = !!restoredProvider;
        void loadModels();
      } catch (err) {
        addToastError(err);
      } finally {
        setModeSwitchBusy(false);
      }
    },
    [authMode, dispatch, gw.request, loadModels, onError, setProviderFilter]
  );

  const switchToLocalMode = React.useCallback(async () => {
    if (authMode === "local-model") return;
    try {
      await dispatch(switchMode({ request: gw.request, target: "local-model" })).unwrap();
    } catch (err) {
      addToastError(err);
      throw err;
    }
  }, [authMode, dispatch, gw.request]);

  const isLoading = modeSwitchBusy || accountState.loading;

  const canShowModels =
    isPaidMode &&
    accountState.mode === "paid" &&
    accountState.jwt &&
    !accountState.needsSubscription &&
    !accountState.subscribePaymentPending &&
    !accountState.provisioning &&
    !isLoading;

  /**
   * Status bar Mode + Model must follow **effective** auth while a paid↔self-managed
   * switch runs: `tabMode` updates immediately on click, but config/`isPaidMode` lag
   * until `switchMode` + `reloadConfig` finish. Local-models tab still uses `tabMode`
   * when the user only selects the segment (switch deferred until Select).
   */
  const statusDisplayMode = modeSwitchBusy && authMode != null ? authMode : (tabMode ?? authMode);
  const statusModeLabel = statusDisplayMode != null ? MODE_LABELS[statusDisplayMode] : "";

  const currentModelName = React.useMemo(() => {
    if (statusDisplayMode === "local-model") {
      const localModel = llamacpp.models.find((m) => m.id === llamacpp.activeModelId);
      if (localModel?.name) return localModel.name;
      const idFromState = llamacpp.activeModelId?.trim();
      if (idFromState) return formatModelIdForStatusBar(idFromState);
      const primary = configPrimaryModelId;
      if (primary?.startsWith(LLAMACPP_PRIMARY_PREFIX)) {
        return formatModelIdForStatusBar(primary.slice(LLAMACPP_PRIMARY_PREFIX.length));
      }
      return null;
    }
    if (activeModelEntry?.name) return activeModelEntry.name;
    const cloudId = activeModelId?.trim();
    if (cloudId) return formatModelIdForStatusBar(cloudId);
    return null;
  }, [
    statusDisplayMode,
    llamacpp.activeModelId,
    llamacpp.models,
    activeModelEntry,
    activeModelId,
    configPrimaryModelId,
  ]);

  const isLocalModelsStatusLayout = statusDisplayMode === "local-model";

  const copyLocalApiEndpoint = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(LOCAL_MODELS_API_ENDPOINT);
      addToast("Copied to clipboard");
    } catch (err) {
      addToastError(err);
    }
  }, []);

  return (
    <div className={s.root}>
      {!noTitle && <div className={s.title}>AI Models</div>}

      {authMode && (
        <div
          className={`${s.statusBar} ${isLocalModelsStatusLayout ? s.statusBarHorizontal : s.statusBarVertical}`}
        >
          {isLocalModelsStatusLayout ? (
            <div className={s.statusBarHorizontalMain}>
              <div className={s.statusSegment}>
                <span className={s.statusLabel}>Mode</span>
                <span className={s.statusValue}>
                  <span className={s.statusValueText}>{statusModeLabel}</span>
                </span>
              </div>
              <div className={s.statusSegment}>
                <span className={s.statusLabel}>Model</span>
                <span className={s.statusValue}>
                  <span className={s.statusValueText}>{currentModelName ?? "Not selected"}</span>
                </span>
              </div>
              <div className={s.statusSegment}>
                <span className={s.statusLabel}>Server</span>
                <span className={s.statusValue}>
                  <span
                    className={`${s.serverDot} ${s[`serverDot--${llamacpp.serverStatus}`] ?? ""}`}
                  />
                  <span className={s.statusValueText}>
                    {SERVER_STATUS_LABELS[llamacpp.serverStatus] ?? llamacpp.serverStatus}
                  </span>
                </span>
              </div>
              <div className={`${s.statusSegment} ${s.statusBarApiEndpoint}`}>
                <span className={s.statusLabel}>API Endpoint</span>
                <span className={s.statusValue}>
                  <span className={s.apiEndpointRow}>
                    <a
                      className={s.apiEndpointLink}
                      href={LOCAL_MODELS_API_ENDPOINT}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openExternal(LOCAL_MODELS_API_ENDPOINT);
                      }}
                    >
                      {LOCAL_MODELS_API_ENDPOINT}
                    </a>
                    <button
                      type="button"
                      className={s.apiEndpointCopyBtn}
                      onClick={() => void copyLocalApiEndpoint()}
                      aria-label="Copy API endpoint URL"
                    >
                      <ApiEndpointCopyIcon />
                    </button>
                  </span>
                </span>
              </div>
            </div>
          ) : (
            <div className={s.statusBarVerticalMain}>
              <div className={s.statusSegment}>
                <span className={s.statusLabel}>Mode</span>
                <span className={s.statusValue}>
                  <span className={s.statusValueText}>{statusModeLabel}</span>
                </span>
              </div>
              <div className={s.statusSegment}>
                <span className={s.statusLabel}>Model</span>
                <span className={s.statusValue}>
                  <span className={s.statusValueText}>{currentModelName ?? "Not selected"}</span>
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <ConnectionToggle
        activeMode={tabMode}
        disabled={modeSwitchBusy}
        showLocalModels={isMac}
        onSelect={handleConnectionSelect}
      />

      {modeSwitchBusy && tabMode && (
        <div className={s.modeSwitchLoader} role="status" aria-live="polite">
          <div className={s.modeSwitchSpinner} aria-hidden="true" />
          <div className={s.modeSwitchLoaderText}>Switching to {MODE_LABELS[tabMode]}...</div>
        </div>
      )}

      {tabMode === "local-model" && !isLoading && (
        <div className="fade-in">
          <LocalModelsTab
            gatewayRequest={gw.request}
            onReload={reload}
            onSwitchToLocalMode={authMode !== "local-model" ? switchToLocalMode : undefined}
          />
        </div>
      )}

      {canShowModels && tabMode === "paid" && (
        <>
          <div className={s.dropdownGroup}>
            <div className={s.dropdownLabel}>Model</div>
            <RichSelect
              value={activeModelId ?? null}
              onChange={handleModelChange}
              options={modelOptions}
              placeholder={modelOptions.length === 0 ? "No models available" : "Select model…"}
              disabled={modelsLoading || modelBusy || modelOptions.length === 0}
              disabledStyles={modelOptions.length === 0}
              onlySelectedIcon
            />
          </div>
          {modelOptions.length === 0 && !modelsLoading ? (
            <div className={s.noModelsHint}>
              No models loaded. Try restarting the app to refresh the model catalog.
            </div>
          ) : null}
        </>
      )}

      {tabMode === "self-managed" && !isLoading && (
        <div className="fade-in">
          <div className={s.dropdownRow}>
            <div className={s.dropdownGroup}>
              <div className={s.dropdownLabel}>Provider</div>
              <RichSelect
                value={selectedProvider}
                onChange={handleProviderChange}
                options={providerOptions}
                placeholder="Select provider…"
                disabled={modelsLoading}
              />
            </div>
            <div className={s.dropdownGroup}>
              <div className={s.dropdownLabel}>Model</div>
              <RichSelect
                value={activeModelId ?? null}
                onChange={handleModelChange}
                options={modelOptions}
                placeholder={
                  !selectedProvider
                    ? "Select provider first"
                    : modelOptions.length === 0
                      ? "Enter API key to choose a model"
                      : "Select model…"
                }
                disabled={
                  !selectedProvider || modelsLoading || modelBusy || modelOptions.length === 0
                }
                disabledStyles={!selectedProvider || modelOptions.length === 0}
                onlySelectedIcon
              />
            </div>
          </div>

          {selectedProvider && modelOptions.length === 0 && !modelsLoading && (
            <div className={s.noModelsHint}>
              {!isSelectedProviderConfigured
                ? "Add an API key below to load models for this provider."
                : "No models loaded. Try restarting the app to refresh the model catalog."}
            </div>
          )}

          {/* Self-managed: inline API key entry */}
          {selectedProviderInfo && (
            <InlineApiKey
              provider={selectedProviderInfo}
              configured={isProviderConfigured(selectedProvider!)}
              busy={busyProvider === selectedProvider}
              onSave={saveProviderApiKey}
              onSaveSetupToken={saveProviderSetupToken}
              onSaveOllama={saveOllamaProvider}
              onRefreshModels={loadModels}
              onPaste={pasteFromClipboard}
              configHash={configHash}
              onOAuthSuccess={handleOAuthSuccess}
            />
          )}
        </div>
      )}

      {/* Paid: account / billing content */}
      {isPaidMode && !modeSwitchBusy && tabMode === "paid" && <AccountTab />}
    </div>
  );
}

function ApiEndpointCopyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      fill="none"
      viewBox="0 0 16 16"
      aria-hidden
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M12 2.5H8A1.5 1.5 0 0 0 6.5 4v1H8a3 3 0 0 1 3 3v1.5h1A1.5 1.5 0 0 0 13.5 8V4A1.5 1.5 0 0 0 12 2.5M11 11h1a3 3 0 0 0 3-3V4a3 3 0 0 0-3-3H8a3 3 0 0 0-3 3v1H4a3 3 0 0 0-3 3v4a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3zM4 6.5h4A1.5 1.5 0 0 1 9.5 8v4A1.5 1.5 0 0 1 8 13.5H4A1.5 1.5 0 0 1 2.5 12V8A1.5 1.5 0 0 1 4 6.5"
        clipRule="evenodd"
      />
    </svg>
  );
}
