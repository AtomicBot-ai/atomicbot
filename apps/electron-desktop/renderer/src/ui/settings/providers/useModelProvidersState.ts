/** @deprecated Part of the legacy Providers tab — scheduled for removal. */
import React from "react";

import { getDesktopApiOrNull } from "@ipc/desktopApi";
import {
  MODEL_PROVIDER_BY_ID,
  MODEL_PROVIDERS,
  type ModelProvider,
} from "@shared/models/providers";
import {
  formatModelMeta,
  getModelTier,
  type ModelEntry,
  sortModelsByProviderTierName,
} from "@shared/models/modelPresentation";
import { loadExtraModels, mergeExtraModels } from "@shared/models/merge-extra-models";
import { errorToMessage } from "@shared/toast";
import type { ConfigData } from "@store/slices/configSlice";
import { patchAuthProfile } from "../../shared/utils/authProfiles";
import { getDefaultModelPrimary, getConfiguredProviders } from "./configParsing";

// TODO: move model catalog state (models, loading, error, keyConfiguredProviders)
// into a Redux slice so any component can access it and gateway-reconnect
// refresh logic lives in one place instead of a per-hook effect.
type GatewayRpc = {
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  connected?: boolean;
};

type ConfigSnapshotLike = {
  hash?: string;
  config?: ConfigData;
};

export function useModelProvidersState(props: {
  gw: GatewayRpc;
  configSnap: ConfigSnapshotLike | null;
  reload: () => Promise<void>;
  onError: (value: string | null) => void;
  isPaidMode: boolean;
  onProviderConfigured?: (provider: ModelProvider) => void;
}) {
  const [busyProvider, setBusyProvider] = React.useState<ModelProvider | null>(null);
  const [modalProvider, setModalProvider] = React.useState<ModelProvider | null>(null);

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

  // ── Derived state ──────────────────────────────────────────────

  const configModelId = React.useMemo(
    () => getDefaultModelPrimary(props.configSnap?.config),
    [props.configSnap?.config]
  );

  const activeModelId = optimisticModelId ?? configModelId;

  const configuredProviders = React.useMemo(
    () => getConfiguredProviders(props.configSnap?.config),
    [props.configSnap?.config]
  );

  const strictConfiguredProviders = React.useMemo(() => {
    if (props.isPaidMode) {
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
  }, [configuredProviders, keyConfiguredProviders, props.isPaidMode]);

  const sortedModels = React.useMemo(() => sortModelsByProviderTierName(models), [models]);

  const visibleProviders = React.useMemo(() => {
    if (props.isPaidMode) {
      return new Set<ModelProvider>(["openrouter"]);
    }
    if (providerFilter === null) {
      return strictConfiguredProviders;
    }
    if (strictConfiguredProviders.has(providerFilter)) {
      return new Set<ModelProvider>([providerFilter]);
    }
    return strictConfiguredProviders;
  }, [providerFilter, strictConfiguredProviders, props.isPaidMode]);

  React.useEffect(() => {
    if (props.isPaidMode) {
      setProviderFilter("openrouter");
    }
  }, [props.isPaidMode]);

  const modalProviderInfo = React.useMemo(
    () => (modalProvider ? (MODEL_PROVIDERS.find((p) => p.id === modalProvider) ?? null) : null),
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

  // ── Actions ────────────────────────────────────────────────────

  const refreshKeyConfiguredProviders = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    if (!api?.authHasApiKey) {
      setKeyConfiguredProviders(null);
      return;
    }
    const results = await Promise.all(MODEL_PROVIDERS.map((p) => api.authHasApiKey(p.id)));
    const next = new Set<ModelProvider>();
    for (let i = 0; i < MODEL_PROVIDERS.length; i += 1) {
      const provider = MODEL_PROVIDERS[i]?.id;
      const configured = results[i]?.configured;
      if (provider && configured) {
        next.add(provider);
      }
    }
    setKeyConfiguredProviders(next);
  }, []);

  const hasModelsRef = React.useRef(false);

  const loadModels = React.useCallback(async () => {
    setModelsError(null);
    // Only show full-page loading on the very first fetch;
    // subsequent refreshes (e.g. after gateway reconnect) update silently
    // so the existing list stays visible and scroll position is preserved.
    if (!hasModelsRef.current) {
      setModelsLoading(true);
    }
    try {
      const result = await props.gw.request<{
        models?: Array<{
          id: string;
          name?: string;
          provider: string;
          contextWindow?: number;
          reasoning?: boolean;
        }>;
      }>("models.list", {});
      const rawEntries: ModelEntry[] = (result.models ?? []).map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        provider: m.provider,
        contextWindow: m.contextWindow,
        reasoning: m.reasoning,
      }));
      const extras = await loadExtraModels();
      const entries = mergeExtraModels(rawEntries, extras);
      setModels(entries);
      hasModelsRef.current = entries.length > 0;
    } catch (err) {
      if (!hasModelsRef.current) {
        setModelsError(errorToMessage(err));
      }
    } finally {
      setModelsLoading(false);
    }
  }, [props.gw]);

  const initialLoadDoneRef = React.useRef(false);
  const prevConfigHashRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    const currentHash = props.configSnap?.hash;
    const isFirstLoad = !initialLoadDoneRef.current;
    const hashChanged = !isFirstLoad && currentHash !== prevConfigHashRef.current;
    prevConfigHashRef.current = currentHash;

    if (isFirstLoad || hashChanged) {
      initialLoadDoneRef.current = true;
      void loadModels();
      void refreshKeyConfiguredProviders();
    }
  }, [loadModels, refreshKeyConfiguredProviders, props.configSnap?.hash]);

  // After a gateway restart the WebSocket reconnects and `connected` flips
  // back to true. Re-fetch the model catalog so newly-configured custom
  // providers (e.g. NVIDIA) whose models only appear in models.json after
  // the restart are picked up without a full app reload.
  const prevConnectedRef = React.useRef(props.gw.connected);
  React.useEffect(() => {
    const was = prevConnectedRef.current;
    prevConnectedRef.current = props.gw.connected;
    if (props.gw.connected && was === false && initialLoadDoneRef.current) {
      void loadModels();
      void refreshKeyConfiguredProviders();
    }
  }, [props.gw.connected, loadModels, refreshKeyConfiguredProviders]);

  // The gateway's model catalog may still be initializing when the first
  // few loadModels() calls land (all triggered nearly simultaneously on
  // mount). Retry with backoff so the UI picks up models once the catalog
  // becomes available, without requiring a manual navigation round-trip.
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
        void loadModels();
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [modelsLoading, models.length, modelsError, loadModels]);

  const isProviderConfigured = React.useCallback(
    (id: ModelProvider): boolean => {
      const configEnabled = configuredProviders.has(id);
      const keyStored = keyConfiguredProviders ? keyConfiguredProviders.has(id) : null;
      return keyStored === null ? configEnabled : configEnabled && keyStored;
    },
    [configuredProviders, keyConfiguredProviders]
  );

  const pasteFromClipboard = React.useCallback(async (): Promise<string> => {
    try {
      const text = await navigator.clipboard.readText();
      return text?.trim() ?? "";
    } catch {
      return "";
    }
  }, []);

  const loadFreshBaseHash = React.useCallback(async (): Promise<string> => {
    const snap = await props.gw.request<{ hash?: string }>("config.get", {});
    const hash = typeof snap.hash === "string" ? snap.hash.trim() : "";
    if (!hash) {
      throw new Error("Missing config base hash. Click Reload and try again.");
    }
    return hash;
  }, [props.gw]);

  const saveProviderApiKey = React.useCallback(
    async (provider: ModelProvider, key: string) => {
      props.onError(null);
      if (!key) {
        props.onError(`${provider} API key is required.`);
        return;
      }

      setBusyProvider(provider);
      try {
        const baseHash = await loadFreshBaseHash();
        await getDesktopApiOrNull()?.setApiKey(provider, key);
        await patchAuthProfile({
          gw: props.gw,
          baseHash,
          provider,
          mode: "api_key",
          notePrefix: "Settings",
        });
        await props.gw.request("secrets.reload", {});
        await props.reload();
        await refreshKeyConfiguredProviders();
        setModalProvider(null);
        props.onProviderConfigured?.(provider);
      } catch (err) {
        props.onError(errorToMessage(err));
      } finally {
        setBusyProvider(null);
      }
    },
    [props, loadFreshBaseHash, refreshKeyConfiguredProviders]
  );

  const saveProviderSetupToken = React.useCallback(
    async (provider: ModelProvider, token: string) => {
      props.onError(null);
      if (!token) {
        props.onError(`${provider} setup token is required.`);
        return;
      }

      setBusyProvider(provider);
      try {
        const baseHash = await loadFreshBaseHash();
        await getDesktopApiOrNull()?.setSetupToken(provider, token);
        await patchAuthProfile({
          gw: props.gw,
          baseHash,
          provider,
          mode: "token",
          notePrefix: "Settings",
        });
        await props.gw.request("secrets.reload", {});
        await props.reload();
        await refreshKeyConfiguredProviders();
        setModalProvider(null);
        props.onProviderConfigured?.(provider);
      } catch (err) {
        props.onError(errorToMessage(err));
      } finally {
        setBusyProvider(null);
      }
    },
    [props, loadFreshBaseHash, refreshKeyConfiguredProviders]
  );

  const saveOllamaProvider = React.useCallback(
    async (params: { baseUrl: string; apiKey: string; mode: string }) => {
      props.onError(null);
      setBusyProvider("ollama");
      try {
        const baseHash = await loadFreshBaseHash();
        await getDesktopApiOrNull()?.setApiKey("ollama", params.apiKey);
        // Patch both the provider config block and the auth profile
        await props.gw.request("config.patch", {
          baseHash,
          raw: JSON.stringify(
            {
              models: {
                providers: {
                  ollama: {
                    baseUrl: params.baseUrl,
                    api: "ollama",
                    apiKey: "OLLAMA_API_KEY", // pragma: allowlist secret
                    models: [],
                  },
                },
              },
              auth: {
                profiles: {
                  "ollama:default": { provider: "ollama", mode: "api_key" },
                },
                order: {
                  ollama: ["ollama:default"],
                },
              },
            },
            null,
            2
          ),
          note: "Settings: configure Ollama provider",
        });
        await props.gw.request("secrets.reload", {});
        await props.reload();
        await refreshKeyConfiguredProviders();
        // Gateway needs a moment to discover Ollama models after config change
        await loadModels();
        setTimeout(() => void loadModels(), 3000);
        setModalProvider(null);
        props.onProviderConfigured?.("ollama");
      } catch (err) {
        props.onError(errorToMessage(err));
      } finally {
        setBusyProvider(null);
      }
    },
    [props, loadFreshBaseHash, refreshKeyConfiguredProviders]
  );

  const clearSessionModelOverrides = React.useCallback(async () => {
    try {
      const listResult = await props.gw.request<{
        sessions?: Array<{ key: string; modelOverride?: string }>;
      }>("sessions.list", { includeGlobal: false, includeUnknown: false });
      const sessions = listResult.sessions ?? [];
      const withOverride = sessions.filter((s) => s.modelOverride);
      await Promise.all(
        withOverride.map((s) => props.gw.request("sessions.patch", { key: s.key, model: null }))
      );
    } catch {
      // Non-critical: if clearing overrides fails, the config default still
      // applies to new sessions; existing ones will catch up on /model reset.
    }
  }, [props.gw]);

  const saveDefaultModel = React.useCallback(
    async (modelId: string) => {
      props.onError(null);
      setModelsError(null);
      setOptimisticModelId(modelId);
      setModelBusy(true);
      try {
        const baseHash = await loadFreshBaseHash();
        await props.gw.request("config.patch", {
          baseHash,
          raw: JSON.stringify(
            {
              agents: {
                defaults: {
                  model: {
                    primary: modelId,
                  },
                  models: {
                    [modelId]: {},
                  },
                },
              },
            },
            null,
            2
          ),
          note: "Settings: set default model",
        });
        await Promise.all([props.reload().catch(() => {}), clearSessionModelOverrides()]);
      } catch (err) {
        props.onError(errorToMessage(err));
        setOptimisticModelId(null);
      } finally {
        setOptimisticModelId(null);
        setModelBusy(false);
      }
    },
    [props, loadFreshBaseHash, clearSessionModelOverrides]
  );

  const toggleProviderFilter = React.useCallback((id: ModelProvider) => {
    setProviderFilter((prev) => (prev === id ? null : id));
  }, []);

  return {
    // State
    busyProvider,
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

    // Derived
    activeModelId,
    strictConfiguredProviders,
    sortedModels,
    visibleProviders,
    modalProviderInfo,
    activeProviderKey,
    activeProviderInfo,
    activeModelEntry,
    activeModelTier,
    activeModelMeta,

    // Actions
    isProviderConfigured,
    pasteFromClipboard,
    saveProviderApiKey,
    saveProviderSetupToken,
    saveOllamaProvider,
    loadModels,
    saveDefaultModel,
    toggleProviderFilter,
  };
}
