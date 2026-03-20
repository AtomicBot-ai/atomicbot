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
import { switchToSubscription, switchToSelfManaged, SetupMode } from "@store/slices/auth/authSlice";
import { reloadConfig, type ConfigData } from "@store/slices/configSlice";
import { addToastError } from "@shared/toast";

import {
  MODEL_PROVIDERS,
  MODEL_PROVIDER_BY_ID,
  type ModelProvider,
  resolveProviderIconUrl,
  getProviderIconUrl,
} from "@shared/models/providers";
import { getModelTier, formatModelMeta, TIER_INFO } from "@shared/models/modelPresentation";
import { useModelProvidersState } from "../providers/useModelProvidersState";
import { AccountTab } from "../account/AccountTab";
import { RichSelect, type RichOption } from "./RichSelect";
import { InlineApiKey } from "./InlineApiKey";
import { useAccountState } from "@ui/settings/account/useAccountState";

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
  isPaid: boolean;
  disabled: boolean;
  onSelect: (mode: "paid" | "self-managed") => void;
}) {
  return (
    <div className={s.connectionSection}>
      <div className={s.connectionSelector} role="radiogroup" aria-label="Connection mode">
        <button
          type="button"
          className={`${s.connectionOption}${props.isPaid ? ` ${s["connectionOption--active"]}` : ""}`}
          onClick={() => void props.onSelect("paid")}
          disabled={props.disabled}
        >
          Atomic Subscription
        </button>
        <button
          type="button"
          className={`${s.connectionOption}${!props.isPaid ? ` ${s["connectionOption--active"]}` : ""}`}
          onClick={() => void props.onSelect("self-managed")}
          disabled={props.disabled}
        >
          Your own API key
        </button>
      </div>
    </div>
  );
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

  // Auto-select first model when provider changes and current model doesn't belong to it
  React.useEffect(() => {
    if (
      !isPaidMode &&
      selectedProvider &&
      modelOptions.length > 0 &&
      !modelOptions.some((opt) => opt.value === activeModelId)
    ) {
      handleModelChange(modelOptions[0]!.value);
    }
  }, [activeModelId, handleModelChange, isPaidMode, modelOptions, selectedProvider]);

  const handleOAuthSuccess = React.useCallback(() => {
    void reload();
  }, [reload]);

  const configHash = typeof configSnap?.hash === "string" ? configSnap.hash : null;

  // ── Mode switching ──

  const handleConnectionSelect = React.useCallback(
    async (mode: "paid" | "self-managed") => {
      setTabMode(mode);

      if ((mode === "paid") === isPaidMode) return;

      setModeSwitchBusy(true);
      try {
        let restoredProvider: ModelProvider | null = null;

        if (mode === "paid") {
          await dispatch(switchToSubscription({ request: gw.request })).unwrap();
        } else {
          const result = await dispatch(switchToSelfManaged({ request: gw.request })).unwrap();
          if (!result.hasBackup) {
            onError("No saved configuration found. Please set up your API keys.");
          }
          if (result.restoredModel) {
            const idx = result.restoredModel.indexOf("/");
            restoredProvider =
              idx > 0 ? (result.restoredModel.slice(0, idx) as ModelProvider) : null;
          }
        }

        await dispatch(reloadConfig({ request: gw.request }));

        // Set provider directly from the restored model to avoid
        // race conditions with the auto-select effect
        setProviderFilter(restoredProvider);
        autoSelectedRef.current = !!restoredProvider;
      } catch (err) {
        addToastError(err);
      } finally {
        setModeSwitchBusy(false);
      }
    },
    [dispatch, gw.request, isPaidMode, onError, setProviderFilter]
  );

  const isLoading = modeSwitchBusy || accountState.loading;

  const canShowModels =
    isPaidMode &&
    accountState.mode === "paid" &&
    accountState.jwt &&
    !accountState.needsSubscription &&
    !accountState.subscribePaymentPending &&
    !accountState.provisioning &&
    !isLoading;

  return (
    <div className={s.root}>
      {!noTitle && <div className={s.title}>AI Models</div>}

      <ConnectionToggle
        isPaid={tabMode === "paid"}
        disabled={modeSwitchBusy}
        onSelect={handleConnectionSelect}
      />

      {canShowModels && (
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

      {!isPaidMode && !isLoading && (
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
      {isPaidMode && !modeSwitchBusy && <AccountTab />}
    </div>
  );
}
