import * as fs from "node:fs";
import JSON5 from "json5";

/**
 * Sigma-specific config adjustments applied on every launcher start:
 *
 *   1. Ensure `models.providers.sigma-local` exists and points at the actual
 *      llama-server port (the C++ supervisor resolves it at runtime — it may
 *      differ between launches if the preferred port was taken).
 *   2. Ensure at least one agent is defaulted to `sigma-local/<model>` so
 *      the extension can chat out-of-the-box without cloud keys.
 */
export function patchSigmaLocalProvider(params: {
  configPath: string;
  llamaPort: number;
  modelId?: string;
}): void {
  const { configPath, llamaPort, modelId } = params;
  if (!fs.existsSync(configPath)) {return;}

  let cfg: Record<string, unknown>;
  try {
    const text = fs.readFileSync(configPath, "utf-8");
    const parsed: unknown = JSON5.parse(text);
    if (!isPlainObject(parsed)) {return;}
    cfg = parsed;
  } catch (err) {
    console.warn("[config-patcher] parse failed:", err);
    return;
  }

  let changed = false;

  // Turn on the OpenAI-compat `/v1/chat/completions` shim — the Sigma browser
  // extension uses it as a fallback transport (equivalent to cloud providers)
  // and it's what makes curl-based smoke tests possible. Default is `false`
  // in upstream OpenClaw.
  const gateway = ensureObject(cfg, "gateway");
  const http = ensureObject(gateway, "http");
  const endpoints = ensureObject(http, "endpoints");
  const chat = asPlainObject(endpoints.chatCompletions);
  if (!chat || chat.enabled !== true) {
    endpoints.chatCompletions = { ...chat, enabled: true };
    changed = true;
  }

  const models = ensureObject(cfg, "models");
  const providers = ensureObject(models, "providers");
  const existing = asPlainObject(providers["sigma-local"]);

  const resolvedModelId = modelId ?? extractModelIdFromProvider(existing) ?? "gemma-3-1b-it";
  const expectedBaseUrl = `http://127.0.0.1:${llamaPort}/v1`;

  // OpenClaw requires a minimum context window of 16000 tokens, otherwise it
  // rejects the model with `FailoverError: Model context window too small`.
  // llama-server must be started with a matching `-c` (or larger) value.
  const MIN_CTX = 16384;

  if (!existing) {
    providers["sigma-local"] = {
      baseUrl: expectedBaseUrl,
      api: "openai-completions",
      apiKey: "no-key",
      models: [
        { id: resolvedModelId, name: resolvedModelId, contextWindow: MIN_CTX },
      ],
    };
    changed = true;
  } else {
    if (existing.baseUrl !== expectedBaseUrl) {
      existing.baseUrl = expectedBaseUrl;
      changed = true;
    }
    // Backfill `name` / bump `contextWindow` on any model entry — required by
    // the OpenClaw Zod schema (ModelDefinitionSchema) + runtime gatekeeping.
    const existingModels = existing.models;
    if (Array.isArray(existingModels)) {
      for (const m of existingModels) {
        if (!isPlainObject(m)) {continue;}
        if (typeof m.name !== "string" && typeof m.id === "string") {
          m.name = m.id;
          changed = true;
        }
        const ctx = m.contextWindow;
        if (typeof ctx !== "number" || ctx < MIN_CTX) {
          m.contextWindow = MIN_CTX;
          changed = true;
        }
      }
    }
  }

  const agents = ensureObject(cfg, "agents");
  const defaults = ensureObject(agents, "defaults");
  const model = asPlainObject(defaults.model);
  const primaryKey = `sigma-local/${resolvedModelId}`;
  if (!model || typeof model.primary !== "string") {
    defaults.model = { primary: primaryKey };
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf-8");
  }
}

function extractModelIdFromProvider(provider: Record<string, unknown> | undefined): string | null {
  if (!provider) {return null;}
  const models = provider.models;
  if (!Array.isArray(models) || models.length === 0) {return null;}
  const first = models[0];
  if (isPlainObject(first) && typeof first.id === "string") {return first.id;}
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asPlainObject(value: unknown): Record<string, unknown> | undefined {
  return isPlainObject(value) ? value : undefined;
}

function ensureObject(root: Record<string, unknown>, key: string): Record<string, unknown> {
  const existing = root[key];
  if (isPlainObject(existing)) {return existing;}
  const obj: Record<string, unknown> = {};
  root[key] = obj;
  return obj;
}
