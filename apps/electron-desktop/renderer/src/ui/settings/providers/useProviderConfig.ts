/** @deprecated Part of the legacy Providers tab — scheduled for removal. */
import React from "react";

import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { MODEL_PROVIDERS, type ModelProvider } from "@shared/models/providers";
import type { ModelEntry } from "@shared/models/modelPresentation";
import { loadExtraModels, mergeExtraModels } from "@shared/models/merge-extra-models";
import { errorToMessage } from "@shared/toast";
import { patchAuthProfile } from "../../shared/utils/authProfiles";
import type { GatewayRpcLike } from "../../onboarding/hooks/types";

type GatewayRpcWithStatus = GatewayRpcLike & { connected?: boolean };

export type ProviderConfigDeps = {
  gw: GatewayRpcWithStatus;
  reload: () => Promise<void>;
  onError: (value: string | null) => void;
  onProviderConfigured?: (provider: ModelProvider) => void;
};

export function useProviderConfig(
  deps: ProviderConfigDeps,
  state: {
    setModels: React.Dispatch<React.SetStateAction<ModelEntry[]>>;
    setModelsLoading: React.Dispatch<React.SetStateAction<boolean>>;
    setModelsError: React.Dispatch<React.SetStateAction<string | null>>;
    setKeyConfiguredProviders: React.Dispatch<React.SetStateAction<Set<ModelProvider> | null>>;
    setModalProvider: React.Dispatch<React.SetStateAction<ModelProvider | null>>;
    setOptimisticModelId: React.Dispatch<React.SetStateAction<string | null>>;
    setModelBusy: React.Dispatch<React.SetStateAction<boolean>>;
    hasModelsRef: React.MutableRefObject<boolean>;
  }
) {
  const [busyProvider, setBusyProvider] = React.useState<ModelProvider | null>(null);

  const refreshKeyConfiguredProviders = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    if (!api?.authHasApiKey) {
      state.setKeyConfiguredProviders(null);
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
    state.setKeyConfiguredProviders(next);
  }, [state.setKeyConfiguredProviders]);

  const loadModels = React.useCallback(async () => {
    state.setModelsError(null);
    if (!state.hasModelsRef.current) {
      state.setModelsLoading(true);
    }
    try {
      const result = await deps.gw.request<{
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
      state.setModels(entries);
      state.hasModelsRef.current = entries.length > 0;
    } catch (err) {
      if (!state.hasModelsRef.current) {
        state.setModelsError(errorToMessage(err));
      }
    } finally {
      state.setModelsLoading(false);
    }
  }, [deps.gw, state.setModels, state.setModelsError, state.setModelsLoading, state.hasModelsRef]);

  const loadFreshBaseHash = React.useCallback(async (): Promise<string> => {
    const snap = await deps.gw.request<{ hash?: string }>("config.get", {});
    const hash = typeof snap.hash === "string" ? snap.hash.trim() : "";
    if (!hash) {
      throw new Error("Missing config base hash. Click Reload and try again.");
    }
    return hash;
  }, [deps.gw]);

  const saveProviderApiKey = React.useCallback(
    async (provider: ModelProvider, key: string) => {
      deps.onError(null);
      if (!key) {
        deps.onError(`${provider} API key is required.`);
        return;
      }

      setBusyProvider(provider);
      try {
        const baseHash = await loadFreshBaseHash();
        await getDesktopApiOrNull()?.setApiKey(provider, key);
        await patchAuthProfile({
          gw: deps.gw,
          baseHash,
          provider,
          mode: "api_key",
          notePrefix: "Settings",
        });
        await deps.gw.request("secrets.reload", {});
        await deps.reload();
        await refreshKeyConfiguredProviders();
        state.setModalProvider(null);
        deps.onProviderConfigured?.(provider);
      } catch (err) {
        deps.onError(errorToMessage(err));
      } finally {
        setBusyProvider(null);
      }
    },
    [deps, loadFreshBaseHash, refreshKeyConfiguredProviders, state.setModalProvider]
  );

  const saveProviderSetupToken = React.useCallback(
    async (provider: ModelProvider, token: string) => {
      deps.onError(null);
      if (!token) {
        deps.onError(`${provider} setup token is required.`);
        return;
      }

      setBusyProvider(provider);
      try {
        const baseHash = await loadFreshBaseHash();
        await getDesktopApiOrNull()?.setSetupToken(provider, token);
        await patchAuthProfile({
          gw: deps.gw,
          baseHash,
          provider,
          mode: "token",
          notePrefix: "Settings",
        });
        await deps.gw.request("secrets.reload", {});
        await deps.reload();
        await refreshKeyConfiguredProviders();
        state.setModalProvider(null);
        deps.onProviderConfigured?.(provider);
      } catch (err) {
        deps.onError(errorToMessage(err));
      } finally {
        setBusyProvider(null);
      }
    },
    [deps, loadFreshBaseHash, refreshKeyConfiguredProviders, state.setModalProvider]
  );

  const saveOllamaProvider = React.useCallback(
    async (params: { baseUrl: string; apiKey: string; mode: string }) => {
      deps.onError(null);
      setBusyProvider("ollama");
      try {
        const baseHash = await loadFreshBaseHash();
        await getDesktopApiOrNull()?.setApiKey("ollama", params.apiKey);
        await deps.gw.request("config.patch", {
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
        await deps.gw.request("secrets.reload", {});
        await deps.reload();
        await refreshKeyConfiguredProviders();
        await loadModels();
        setTimeout(() => void loadModels(), 3000);
        state.setModalProvider(null);
        deps.onProviderConfigured?.("ollama");
      } catch (err) {
        deps.onError(errorToMessage(err));
      } finally {
        setBusyProvider(null);
      }
    },
    [deps, loadFreshBaseHash, refreshKeyConfiguredProviders, loadModels, state.setModalProvider]
  );

  const clearSessionModelOverrides = React.useCallback(async () => {
    try {
      const listResult = await deps.gw.request<{
        sessions?: Array<{ key: string; modelOverride?: string }>;
      }>("sessions.list", { includeGlobal: false, includeUnknown: false });
      const sessions = listResult.sessions ?? [];
      const withOverride = sessions.filter((s) => s.modelOverride);
      await Promise.all(
        withOverride.map((s) => deps.gw.request("sessions.patch", { key: s.key, model: null }))
      );
    } catch {
      // Non-critical
    }
  }, [deps.gw]);

  const saveDefaultModel = React.useCallback(
    async (modelId: string) => {
      deps.onError(null);
      state.setModelsError(null);
      state.setOptimisticModelId(modelId);
      state.setModelBusy(true);
      try {
        const baseHash = await loadFreshBaseHash();
        await deps.gw.request("config.patch", {
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
        await Promise.all([
          deps.reload().catch((err) => console.warn("[model-providers] reload after model change:", err)),
          clearSessionModelOverrides(),
        ]);
      } catch (err) {
        deps.onError(errorToMessage(err));
        state.setOptimisticModelId(null);
      } finally {
        state.setOptimisticModelId(null);
        state.setModelBusy(false);
      }
    },
    [deps, loadFreshBaseHash, clearSessionModelOverrides, state.setModelsError, state.setOptimisticModelId, state.setModelBusy]
  );

  const pasteFromClipboard = React.useCallback(async (): Promise<string> => {
    try {
      const text = await navigator.clipboard.readText();
      return text?.trim() ?? "";
    } catch {
      return "";
    }
  }, []);

  return {
    busyProvider,
    refreshKeyConfiguredProviders,
    loadModels,
    saveProviderApiKey,
    saveProviderSetupToken,
    saveOllamaProvider,
    saveDefaultModel,
    pasteFromClipboard,
  };
}
