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
import { addToastError } from "@shared/toast";

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
import { useAccountState } from "@ui/settings/account/useAccountState";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { LocalModelsTab } from "../local-models/LocalModelsTab";
import { fetchLlamacppServerStatus } from "@store/slices/llamacppSlice";

import { ConnectionToggle, MODE_LABELS, providerBadge, ProviderModelSection } from "./ProviderModelSection";
import {
  AccountModelsStatusBar,
  LLAMACPP_PRIMARY_PREFIX,
  formatModelIdForStatusBar,
} from "./AccountModelsStatusBar";
import s from "./AccountModelsTab.module.css";
import type { ConfigSnapshot, GatewayRpcLike } from "../../onboarding/hooks/types";

type GatewayRpcWithStatus = GatewayRpcLike & { connected?: boolean };

export function AccountModelsTab(props: {
  gw: GatewayRpcWithStatus;
  configSnap: ConfigSnapshot | null;
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
    () => getDefaultModelPrimary(configSnap?.config as ConfigData | undefined),
    [configSnap?.config]
  );

  React.useEffect(() => {
    if (authMode === "local-model" || tabMode === "local-model") {
      void dispatch(fetchLlamacppServerStatus());
    }
  }, [authMode, tabMode, dispatch]);

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

  return (
    <div className={s.root}>
      {!noTitle && <div className={s.title}>AI Models</div>}

      {authMode && (
        <AccountModelsStatusBar
          isLocalModels={isLocalModelsStatusLayout}
          modeLabel={statusModeLabel}
          modelName={currentModelName}
          serverStatus={llamacpp.serverStatus}
        />
      )}

      <ConnectionToggle
        activeMode={tabMode}
        disabled={modeSwitchBusy}
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
          {isMac ? (
            <LocalModelsTab
              gatewayRequest={gw.request}
              onReload={reload}
              onSwitchToLocalMode={authMode !== "local-model" ? switchToLocalMode : undefined}
            />
          ) : (
            <div className={s.comingSoonBanner}>
              <span className={s.comingSoonIcon}>🖥</span>
              <div className={s.comingSoonBody}>
                <div className={s.comingSoonTitle}>Coming Soon</div>
                <div className={s.comingSoonDesc}>
                  Local models support for Windows is under development. Stay tuned!
                </div>
              </div>
            </div>
          )}
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
        <ProviderModelSection
          selectedProvider={selectedProvider}
          selectedProviderInfo={selectedProviderInfo}
          providerOptions={providerOptions}
          modelOptions={modelOptions}
          activeModelId={activeModelId ?? null}
          modelsLoading={modelsLoading}
          modelBusy={modelBusy}
          isSelectedProviderConfigured={isSelectedProviderConfigured}
          busyProvider={busyProvider}
          isProviderConfigured={isProviderConfigured}
          configHash={configHash}
          onProviderChange={handleProviderChange}
          onModelChange={handleModelChange}
          onSaveApiKey={saveProviderApiKey}
          onSaveSetupToken={saveProviderSetupToken}
          onSaveOllama={saveOllamaProvider}
          onRefreshModels={loadModels}
          onPaste={pasteFromClipboard}
          onOAuthSuccess={handleOAuthSuccess}
        />
      )}

      {isPaidMode && !modeSwitchBusy && tabMode === "paid" && <AccountTab />}
    </div>
  );
}
