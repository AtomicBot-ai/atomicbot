import React from "react";
import type { ConfigSnapshot, GatewayRpcLike, ModelsListResult } from "./types";
import type { ModelEntry } from "@shared/models/modelPresentation";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { getObject } from "./utils";
import { loadExtraModels, mergeExtraModels } from "@shared/models/merge-extra-models";

type PaidConfigInput = {
  gw: GatewayRpcLike;
};

/**
 * Gateway config helpers for the paid onboarding flow:
 * config loading, provider flag refresh, placeholder key,
 * model list, and default model saving.
 */
export function usePaidConfig({ gw }: PaidConfigInput) {
  const [models, setModels] = React.useState<ModelEntry[]>([]);
  const [modelsLoading, setModelsLoading] = React.useState(false);
  const [modelsError, setModelsError] = React.useState<string | null>(null);
  const [hasOpenAiProvider, setHasOpenAiProvider] = React.useState(false);

  const loadConfig = React.useCallback(async (): Promise<ConfigSnapshot> => {
    return gw.request<ConfigSnapshot>("config.get");
  }, [gw]);

  const refreshProviderFlags = React.useCallback(async () => {
    try {
      const snap = await loadConfig();
      const cfg = getObject(snap.config);
      const auth = getObject(cfg.auth);
      const profiles = getObject(auth.profiles);
      const order = getObject(auth.order);
      const hasProfile = Object.values(profiles).some((p) => {
        if (!p || typeof p !== "object" || Array.isArray(p)) return false;
        return (p as { provider?: unknown }).provider === "openai";
      });
      const hasOrder = Object.prototype.hasOwnProperty.call(order, "openai");
      setHasOpenAiProvider(Boolean(hasProfile || hasOrder));
    } catch {
      setHasOpenAiProvider(false);
    }
  }, [loadConfig]);

  const savePlaceholderOpenRouterKey = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    if (api?.setApiKey) {
      await api.setApiKey("openrouter", "pending");
    }
    const snap = await loadConfig();
    const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
    if (!baseHash) {
      throw new Error("Config base hash missing. Reload and try again.");
    }
    const profileId = "openrouter:default";
    await gw.request("config.patch", {
      baseHash,
      raw: JSON.stringify(
        {
          auth: {
            profiles: {
              [profileId]: { provider: "openrouter", mode: "api_key" },
            },
            order: {
              openrouter: [profileId],
            },
          },
        },
        null,
        2
      ),
      note: "Welcome: enable openrouter placeholder for paid flow",
    });
  }, [gw, loadConfig]);

  const loadModels = React.useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const result = await gw.request<ModelsListResult>("models.list", {});
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
    } catch (err) {
      setModelsError(String(err));
    } finally {
      setModelsLoading(false);
    }
  }, [gw]);

  const saveDefaultModel = React.useCallback(
    async (modelId: string) => {
      const snap = await loadConfig();
      const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
      if (!baseHash) {
        throw new Error("Config base hash missing. Reload and try again.");
      }
      await gw.request("config.patch", {
        baseHash,
        raw: JSON.stringify(
          {
            agents: {
              defaults: {
                model: { primary: modelId },
                models: { [modelId]: {} },
              },
            },
          },
          null,
          2
        ),
        note: "Welcome: set default model (paid)",
      });
    },
    [gw, loadConfig]
  );

  return {
    models,
    modelsLoading,
    modelsError,
    hasOpenAiProvider,
    loadConfig,
    refreshProviderFlags,
    savePlaceholderOpenRouterKey,
    loadModels,
    saveDefaultModel,
  } as const;
}
