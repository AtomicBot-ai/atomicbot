/**
 * Extracted sub-components and helpers for the AccountModelsTab.
 * @deprecated Part of the legacy AccountModels tab — scheduled for removal.
 */
import React from "react";
import type { SetupMode } from "@store/slices/auth/authSlice";
import type { ModelProvider, ModelProviderInfo } from "@shared/models/providers";
import type { RichOption } from "./RichSelect";
import { RichSelect } from "./RichSelect";
import { InlineApiKey } from "./InlineApiKey";
import s from "./AccountModelsTab.module.css";

export const MODE_LABELS: Record<SetupMode, string> = {
  paid: "Subscription",
  "self-managed": "API keys",
  "local-model": "Local Models",
};

export function providerBadge(p: {
  recommended?: boolean;
  popular?: boolean;
  localModels?: boolean;
  privacyFirst?: boolean;
}): { text: string; variant: string } | undefined {
  if (p.recommended) return { text: "Recommended", variant: "recommended" };
  if (p.popular) return { text: "Popular", variant: "popular" };
  if (p.localModels) return { text: "Local models", variant: "local" };
  if (p.privacyFirst) return { text: "Privacy First", variant: "privacy" };
  return undefined;
}

export function ConnectionToggle(props: {
  activeMode: SetupMode | null;
  disabled: boolean;
  onSelect: (mode: SetupMode) => void;
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
        <button
          type="button"
          className={`${s.connectionOption}${active === "local-model" ? ` ${s["connectionOption--active"]}` : ""}`}
          onClick={() => void props.onSelect("local-model")}
          disabled={props.disabled}
        >
          Local Models
        </button>
      </div>
    </div>
  );
}

export type ProviderModelSectionProps = {
  selectedProvider: ModelProvider | null;
  selectedProviderInfo: ModelProviderInfo | null;
  providerOptions: RichOption<ModelProvider>[];
  modelOptions: RichOption<string>[];
  activeModelId: string | null;
  modelsLoading: boolean;
  modelBusy: boolean;
  isSelectedProviderConfigured: boolean;
  busyProvider: ModelProvider | null;
  isProviderConfigured: (id: ModelProvider) => boolean;
  configHash: string | null;
  onProviderChange: (value: ModelProvider) => void;
  onModelChange: (value: string) => void;
  onSaveApiKey: (provider: ModelProvider, key: string) => Promise<void>;
  onSaveSetupToken: (provider: ModelProvider, token: string) => Promise<void>;
  onSaveOllama: (params: { baseUrl: string; apiKey: string; mode: string }) => Promise<void>;
  onRefreshModels: () => Promise<void>;
  onPaste: () => Promise<string>;
  onOAuthSuccess: () => void;
};

export function ProviderModelSection(props: ProviderModelSectionProps) {
  const {
    selectedProvider,
    selectedProviderInfo,
    providerOptions,
    modelOptions,
    activeModelId,
    modelsLoading,
    modelBusy,
    isSelectedProviderConfigured,
    busyProvider,
    isProviderConfigured,
    configHash,
    onProviderChange,
    onModelChange,
    onSaveApiKey,
    onSaveSetupToken,
    onSaveOllama,
    onRefreshModels,
    onPaste,
    onOAuthSuccess,
  } = props;

  return (
    <div className="fade-in">
      <div className={s.dropdownRow}>
        <div className={s.dropdownGroup}>
          <div className={s.dropdownLabel}>Provider</div>
          <RichSelect
            value={selectedProvider}
            onChange={onProviderChange}
            options={providerOptions}
            placeholder="Select provider…"
            disabled={modelsLoading}
          />
        </div>
        <div className={s.dropdownGroup}>
          <div className={s.dropdownLabel}>Model</div>
          <RichSelect
            value={activeModelId ?? null}
            onChange={onModelChange}
            options={modelOptions}
            placeholder={
              !selectedProvider
                ? "Select provider first"
                : modelOptions.length === 0
                  ? "Enter API key to choose a model"
                  : "Select model…"
            }
            disabled={!selectedProvider || modelsLoading || modelBusy || modelOptions.length === 0}
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

      {selectedProviderInfo && (
        <InlineApiKey
          provider={selectedProviderInfo}
          configured={isProviderConfigured(selectedProvider!)}
          busy={busyProvider === selectedProvider}
          onSave={onSaveApiKey}
          onSaveSetupToken={onSaveSetupToken}
          onSaveOllama={onSaveOllama}
          onRefreshModels={onRefreshModels}
          onPaste={onPaste}
          configHash={configHash}
          onOAuthSuccess={onOAuthSuccess}
        />
      )}
    </div>
  );
}
