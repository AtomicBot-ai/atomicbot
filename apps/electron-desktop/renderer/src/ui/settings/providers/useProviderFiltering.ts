/** @deprecated Part of the legacy Providers tab — scheduled for removal. */
import React from "react";

import {
  MODEL_PROVIDER_BY_ID,
  type ModelProvider,
} from "@shared/models/providers";
import {
  formatModelMeta,
  getModelTier,
  type ModelEntry,
  sortModelsByProviderTierName,
} from "@shared/models/modelPresentation";
import type { ConfigData } from "@store/slices/configSlice";
import { getDefaultModelPrimary, getConfiguredProviders } from "./configParsing";
import type { ConfigSnapshot } from "../../onboarding/hooks/types";

export function useProviderFiltering(opts: {
  configSnap: ConfigSnapshot | null;
  isPaidMode: boolean;
  providerFilter: ModelProvider | null;
  keyConfiguredProviders: Set<ModelProvider> | null;
  models: ModelEntry[];
  optimisticModelId: string | null;
  modalProvider: ModelProvider | null;
}) {
  const {
    configSnap,
    isPaidMode,
    providerFilter,
    keyConfiguredProviders,
    models,
    optimisticModelId,
    modalProvider,
  } = opts;

  const configModelId = React.useMemo(
    () => getDefaultModelPrimary(configSnap?.config as ConfigData | undefined),
    [configSnap?.config]
  );

  const activeModelId = optimisticModelId ?? configModelId;

  const configuredProviders = React.useMemo(
    () => getConfiguredProviders(configSnap?.config as ConfigData | undefined),
    [configSnap?.config]
  );

  const strictConfiguredProviders = React.useMemo(() => {
    if (isPaidMode) {
      return new Set<ModelProvider>(["openrouter"]);
    }
    if (!keyConfiguredProviders) {
      return configuredProviders;
    }
    const out = new Set<ModelProvider>();
    for (const p of configuredProviders) {
      if (keyConfiguredProviders.has(p)) {
        out.add(p);
      }
    }
    return out;
  }, [configuredProviders, keyConfiguredProviders, isPaidMode]);

  const sortedModels = React.useMemo(() => sortModelsByProviderTierName(models), [models]);

  const visibleProviders = React.useMemo(() => {
    if (isPaidMode) {
      return new Set<ModelProvider>(["openrouter"]);
    }
    if (providerFilter === null) {
      return strictConfiguredProviders;
    }
    if (strictConfiguredProviders.has(providerFilter)) {
      return new Set<ModelProvider>([providerFilter]);
    }
    return strictConfiguredProviders;
  }, [providerFilter, strictConfiguredProviders, isPaidMode]);

  const modalProviderInfo = React.useMemo(
    () => (modalProvider ? (MODEL_PROVIDER_BY_ID[modalProvider] ?? null) : null),
    [modalProvider]
  );

  const activeProviderKey = React.useMemo(() => {
    const id = activeModelId ?? "";
    const idx = id.indexOf("/");
    return idx > 0 ? (id.slice(0, idx).trim().toLowerCase() as ModelProvider) : null;
  }, [activeModelId]);

  const activeProviderInfo = React.useMemo(
    () => (activeProviderKey ? (MODEL_PROVIDER_BY_ID[activeProviderKey] ?? null) : null),
    [activeProviderKey]
  );

  const activeModelEntry = React.useMemo(() => {
    if (!activeModelId) {
      return null;
    }
    return models.find((m) => `${m.provider}/${m.id}` === activeModelId) ?? null;
  }, [models, activeModelId]);

  const activeModelTier = React.useMemo(
    () => (activeModelEntry ? getModelTier(activeModelEntry) : null),
    [activeModelEntry]
  );

  const activeModelMeta = React.useMemo(
    () => (activeModelEntry ? formatModelMeta(activeModelEntry) : null),
    [activeModelEntry]
  );

  const isProviderConfigured = React.useCallback(
    (id: ModelProvider): boolean => {
      const configEnabled = configuredProviders.has(id);
      const keyStored = keyConfiguredProviders ? keyConfiguredProviders.has(id) : null;
      return keyStored === null ? configEnabled : configEnabled && keyStored;
    },
    [configuredProviders, keyConfiguredProviders]
  );

  return {
    configModelId,
    activeModelId,
    configuredProviders,
    strictConfiguredProviders,
    sortedModels,
    visibleProviders,
    modalProviderInfo,
    activeProviderKey,
    activeProviderInfo,
    activeModelEntry,
    activeModelTier,
    activeModelMeta,
    isProviderConfigured,
  };
}
