import { LLAMACPP_LOCAL_BASE_URL } from "@main/constants";
import type { GatewayRequest } from "./chat/chatSlice";
import type { ConfigSnapshot } from "../../ui/onboarding/hooks/types";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readPrimaryModel(config: unknown): string | null {
  const cfg = asObject(config);
  const agents = asObject(cfg.agents);
  const defaults = asObject(agents.defaults);
  const model = asObject(defaults.model);
  const primary = typeof model.primary === "string" ? model.primary.trim() : "";
  return primary || null;
}

export async function applyLocalModelConfig(params: {
  request: GatewayRequest;
  modelId: string;
  modelName: string;
  contextLength?: number;
}): Promise<string> {
  const snap = await params.request<ConfigSnapshot>("config.get", {});
  const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
  if (!baseHash) {
    throw new Error("Missing config base hash while enabling local model.");
  }

  const current = asObject(snap.config);
  const currentModels = asObject(current.models);
  const currentProviders = asObject(currentModels.providers);
  const currentAgents = asObject(current.agents);
  const currentDefaults = asObject(currentAgents.defaults);
  const currentDefaultModel = asObject(currentDefaults.model);
  const currentDefaultModels = asObject(currentDefaults.models);
  const localModelRef = `llamacpp/${params.modelId}`;
  const models: Array<Record<string, unknown>> = [];
  if (params.contextLength) {
    models.push({
      id: params.modelId,
      name: params.modelName,
      api: "openai-completions",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: params.contextLength,
      maxTokens: Math.min(params.contextLength, 32_768),
    });
  }

  const nextConfig: Record<string, unknown> = {
    ...current,
    auth: {
      profiles: {
        "llamacpp:default": { provider: "llamacpp", mode: "api_key" },
      },
      order: {
        llamacpp: ["llamacpp:default"],
      },
    },
    models: {
      ...currentModels,
      providers: {
        ...currentProviders,
        llamacpp: {
          ...asObject(currentProviders.llamacpp),
          baseUrl: LLAMACPP_LOCAL_BASE_URL,
          api: "openai-completions",
          apiKey: "LLAMACPP_LOCAL_KEY",
          models,
        },
      },
    },
    agents: {
      ...currentAgents,
      defaults: {
        ...currentDefaults,
        model: {
          ...currentDefaultModel,
          primary: localModelRef,
        },
        models: {
          ...currentDefaultModels,
          [localModelRef]: currentDefaultModels[localModelRef] ?? {},
        },
      },
    },
  };

  await params.request("config.apply", {
    baseHash,
    raw: JSON.stringify(nextConfig, null, 2),
  });

  const verify = await params.request<ConfigSnapshot>("config.get", {});
  if (readPrimaryModel(verify.config) !== localModelRef) {
    throw new Error(`Local model config did not persist primary model: ${localModelRef}`);
  }

  return localModelRef;
}
