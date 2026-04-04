/** @deprecated Part of the legacy Providers tab — scheduled for removal. */
import React from "react";

import type { ModelProvider } from "@shared/models/providers";
import type { ModelEntry } from "@shared/models/modelPresentation";
import { errorToMessage } from "@shared/toast";
import type { ConfigSnapshot, GatewayRpcLike } from "../../onboarding/hooks/types";
import { useProviderFiltering } from "./useProviderFiltering";
import { useProviderConfig } from "./useProviderConfig";

type GatewayRpcWithStatus = GatewayRpcLike & { connected?: boolean };

export function useModelProvidersState(props: {
  gw: GatewayRpcWithStatus;
  configSnap: ConfigSnapshot | null;
  reload: () => Promise<void>;
  onError: (value: string | null) => void;
  isPaidMode: boolean;
  onProviderConfigured?: (provider: ModelProvider) => void;
}) {
  const [models, setModels] = React.useState<ModelEntry[]>([]);
  const [modelsLoading, setModelsLoading] = React.useState(false);
  const [modelsError, setModelsError] = React.useState<string | null>(null);
  const [modelSearch, setModelSearch] = React.useState("");
  const [modelBusy, setModelBusy] = React.useState(false);
  const [keyConfiguredProviders, setKeyConfiguredProviders] =
    React.useState<Set<ModelProvider> | null>(null);
  const [providerFilter, setProviderFilter] = React.useState<ModelProvider | null>(
    props.isPaidMode ? "openrouter" : null
  );
  const [optimisticModelId, setOptimisticModelId] = React.useState<string | null>(null);
  const [modalProvider, setModalProvider] = React.useState<ModelProvider | null>(null);

  const hasModelsRef = React.useRef(false);

  // ── Derived / filtering state ──
  const filtering = useProviderFiltering({
    configSnap: props.configSnap,
    isPaidMode: props.isPaidMode,
    providerFilter,
    keyConfiguredProviders,
    models,
    optimisticModelId,
    modalProvider,
  });

  // ── Config / save actions ──
  const config = useProviderConfig(
    {
      gw: props.gw,
      reload: props.reload,
      onError: props.onError,
      onProviderConfigured: props.onProviderConfigured,
    },
    {
      setModels,
      setModelsLoading,
      setModelsError,
      setKeyConfiguredProviders,
      setModalProvider,
      setOptimisticModelId,
      setModelBusy,
      hasModelsRef,
    }
  );

  // ── Effects ──

  React.useEffect(() => {
    if (props.isPaidMode) {
      setProviderFilter("openrouter");
    }
  }, [props.isPaidMode]);

  const initialLoadDoneRef = React.useRef(false);
  const prevConfigHashRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    const currentHash = props.configSnap?.hash;
    const isFirstLoad = !initialLoadDoneRef.current;
    const hashChanged = !isFirstLoad && currentHash !== prevConfigHashRef.current;
    prevConfigHashRef.current = currentHash;

    if (isFirstLoad || hashChanged) {
      initialLoadDoneRef.current = true;
      void config.loadModels();
      void config.refreshKeyConfiguredProviders();
    }
  }, [config.loadModels, config.refreshKeyConfiguredProviders, props.configSnap?.hash]);

  const prevConnectedRef = React.useRef(props.gw.connected);
  React.useEffect(() => {
    const was = prevConnectedRef.current;
    prevConnectedRef.current = props.gw.connected;
    if (props.gw.connected && was === false && initialLoadDoneRef.current) {
      void config.loadModels();
      void config.refreshKeyConfiguredProviders();
    }
  }, [props.gw.connected, config.loadModels, config.refreshKeyConfiguredProviders]);

  const prevPaidModeRef = React.useRef(props.isPaidMode);
  React.useEffect(() => {
    if (prevPaidModeRef.current === props.isPaidMode) return;
    prevPaidModeRef.current = props.isPaidMode;
    if (initialLoadDoneRef.current) {
      void config.loadModels();
      void config.refreshKeyConfiguredProviders();
    }
  }, [props.isPaidMode, config.loadModels, config.refreshKeyConfiguredProviders]);

  const emptyRetryRef = React.useRef(0);
  React.useEffect(() => {
    if (models.length > 0) {
      emptyRetryRef.current = 0;
      return;
    }
    if (initialLoadDoneRef.current && !modelsLoading && !modelsError && emptyRetryRef.current < 5) {
      const delay = 1000 * Math.pow(1.5, emptyRetryRef.current);
      const timer = setTimeout(() => {
        emptyRetryRef.current += 1;
        void config.loadModels();
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [modelsLoading, models.length, modelsError, config.loadModels]);

  const toggleProviderFilter = React.useCallback((id: ModelProvider) => {
    setProviderFilter((prev) => (prev === id ? null : id));
  }, []);

  return {
    // State
    busyProvider: config.busyProvider,
    modalProvider,
    setModalProvider,
    models,
    modelsLoading,
    modelsError,
    modelSearch,
    setModelSearch,
    modelBusy,
    providerFilter,
    setProviderFilter,

    // Derived (from useProviderFiltering)
    activeModelId: filtering.activeModelId,
    strictConfiguredProviders: filtering.strictConfiguredProviders,
    sortedModels: filtering.sortedModels,
    visibleProviders: filtering.visibleProviders,
    modalProviderInfo: filtering.modalProviderInfo,
    activeProviderKey: filtering.activeProviderKey,
    activeProviderInfo: filtering.activeProviderInfo,
    activeModelEntry: filtering.activeModelEntry,
    activeModelTier: filtering.activeModelTier,
    activeModelMeta: filtering.activeModelMeta,

    // Actions
    isProviderConfigured: filtering.isProviderConfigured,
    pasteFromClipboard: config.pasteFromClipboard,
    saveProviderApiKey: config.saveProviderApiKey,
    saveProviderSetupToken: config.saveProviderSetupToken,
    saveOllamaProvider: config.saveOllamaProvider,
    loadModels: config.loadModels,
    saveDefaultModel: config.saveDefaultModel,
    toggleProviderFilter,
  };
}
