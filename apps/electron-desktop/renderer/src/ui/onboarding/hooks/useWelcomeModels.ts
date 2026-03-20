import React from "react";
import { errorToMessage } from "@shared/toast";
import type { ConfigSnapshot, GatewayRpcLike, ModelsListResult } from "./types";
import { ModelEntry } from "@shared/models/modelPresentation";
import { loadExtraModels, mergeExtraModels } from "@shared/models/merge-extra-models";

type UseWelcomeModelsInput = {
  gw: GatewayRpcLike;
  loadConfig: () => Promise<ConfigSnapshot>;
  setError: (value: string | null) => void;
  setStatus: (value: string | null) => void;
  goSkills: () => void;
};

export function useWelcomeModels({
  gw,
  loadConfig,
  setError,
  setStatus,
  goSkills,
}: UseWelcomeModelsInput) {
  const [models, setModels] = React.useState<ModelEntry[]>([]);
  const [modelsLoading, setModelsLoading] = React.useState(false);
  const [modelsError, setModelsError] = React.useState<string | null>(null);

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
      setModelsError(errorToMessage(err));
    } finally {
      setModelsLoading(false);
    }
  }, [gw]);

  const saveDefaultModel = React.useCallback(
    async (modelId: string): Promise<boolean> => {
      setError(null);
      setStatus("Setting default model…");
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
        note: "Welcome: set default model",
      });
      setStatus("Default model configured.");
      return true;
    },
    [gw, loadConfig, setError, setStatus]
  );

  const onModelSelect = React.useCallback(
    async (modelId: string) => {
      setError(null);
      try {
        await saveDefaultModel(modelId);
        goSkills();
      } catch (err) {
        setError(errorToMessage(err));
      }
    },
    [saveDefaultModel, goSkills, setError]
  );

  return {
    loadModels,
    models,
    modelsError,
    modelsLoading,
    onModelSelect,
    saveDefaultModel,
  };
}
