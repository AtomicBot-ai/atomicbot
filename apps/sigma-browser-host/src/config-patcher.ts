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
 *   3. Keep `browser.profiles.user.cdpUrl` in sync with the live gateway port.
 *      Migration v5 seeds this profile with a hardcoded legacy port (18792)
 *      that predates the current derive-from-gateway-port contract. The
 *      Sigma Eclipse extension always connects to `gateway.port + 3`
 *      (RELAY_PORT_OFFSET), which must match the `cdpUrl` the gateway uses
 *      to spawn the extension-relay HTTP/WS server. Without this patch, the
 *      extension ends up attached to a second relay (auto-created as
 *      `chrome-relay` profile) while the agent routes through the stale
 *      `user` profile — they don't meet, and `browser` tool calls fail with
 *      `CDP /json/version missing webSocketDebuggerUrl; fallback: HTTP 404`.
 *   4. Enforce the browser-focused tool policy on the ROOT-level `tools`
 *      key. Sigma is shipped as an agentic browser (open tabs, click, type),
 *      so the agent's effective toolset is locked down to the `browser` tool
 *      plus a few read-only helpers (memory + session status). Everything
 *      else (`web_fetch`, `web_search`, `exec`, fs writes, messaging,
 *      sub-agents, …) is hard-denied so the LLM can't drift into
 *      shell/file/cloud territory. Opt-out via SIGMA_DISABLE_BROWSER_FOCUS=1
 *      for power users who want the full tool catalog.
 *
 *      NOTE on placement: the OpenClaw Zod schema (`zod-schema.ts`) declares
 *      the global tool-policy under the root `tools` key. `agents.defaults`
 *      is `.strict()` and does NOT accept a `tools` field. An earlier version
 *      of this patcher mistakenly wrote `agents.defaults.tools`, which made
 *      the gateway crash on startup with `Unrecognized key: "tools"`. This
 *      patcher therefore (a) writes the policy under `cfg.tools` and (b)
 *      deletes any stale `agents.defaults.tools` left over from that bug.
 */
const SIGMA_BROWSER_FOCUS_ALLOW = [
  "browser",
  "memory_get",
  "memory_search",
  "session_status",
] as const;

const SIGMA_BROWSER_FOCUS_DENY = [
  "web_fetch",
  "web_search",
  "exec",
  "process",
  "read",
  "write",
  "edit",
  "apply_patch",
  "cron",
  "image",
  "tts",
  "canvas",
  "message",
  "sessions_send",
  "sessions_spawn",
  "sessions_yield",
  "subagents",
  "agents_list",
  "nodes",
  "gateway",
] as const;
export async function patchSigmaLocalProvider(params: {
  configPath: string;
  llamaPort: number;
  gatewayPort?: number;
  modelId?: string;
  cloudProvider?: string;
  cloudApiKey?: string;
  cloudModelId?: string;
  cloudBaseUrl?: string;
}): Promise<void> {
  const { configPath, llamaPort, gatewayPort, modelId,
          cloudProvider, cloudApiKey, cloudModelId, cloudBaseUrl } = params;
  const isCloud = !!cloudProvider && cloudProvider !== "none" &&
                  !!cloudApiKey && cloudApiKey.length > 0;
  if (!fs.existsSync(configPath)) {return;}

  // Try to discover the actually-loaded model + its server-side n_ctx from
  // llama-server. This keeps the OpenClaw config honest across model switches
  // (e.g. the user swaps gemma-3-1b-it for gemma-4-26B-A4B-it) without
  // requiring a manual patcher change. Falls back gracefully if the server is
  // not reachable (first-launch / port contention).
  const live = await probeLlamaServer(llamaPort);

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

  // Allow the Sigma Eclipse browser extension to open the gateway WebSocket.
  //
  // Node.js (the gateway runtime) reports `URL.origin` as the literal string
  // "null" for any non-special scheme — `chrome-extension://<id>` included.
  // That means `allowedOrigins: ["null"]` (upstream OpenClaw's default seed)
  // already matches browser-extension connections on the server side; the
  // textual `chrome-extension://<id>` entry never matches in Node's URL
  // parser. We therefore:
  //   1. Keep `"null"` if present (removing it silently breaks the extension),
  //   2. Additionally record the deterministic extension origin so the
  //      allowlist is self-documenting and ready for a future origin-check
  //      impl that parses chrome-extension:// schemes explicitly.
  //
  // Additional ids for unpacked dev builds with a different `key` can be
  // supplied via env: SIGMA_BROWSER_EXTENSION_IDS=id1,id2 (comma-separated).
  const controlUi = ensureObject(gateway, "controlUi");
  const requiredExtensionOrigins = collectRequiredExtensionOrigins();
  const existingOrigins = Array.isArray(controlUi.allowedOrigins)
    ? (controlUi.allowedOrigins as unknown[]).filter(
        (v): v is string => typeof v === "string",
      )
    : [];
  const merged = mergeOrigins(existingOrigins, requiredExtensionOrigins);
  if (merged.changed) {
    controlUi.allowedOrigins = merged.origins;
    changed = true;
  }

  // Sync browser.profiles.user.cdpUrl with the live gateway port.
  //
  // Contract:
  //   - The Sigma Eclipse extension (background/background.ts) computes the
  //     extension-relay port as `gateway.port + RELAY_PORT_OFFSET` where
  //     RELAY_PORT_OFFSET = 3. That's where `chrome.tabs.create`-style
  //     CDP commands flow.
  //   - OpenClaw spawns an extension-relay server at whatever port the
  //     profile's `cdpUrl` points to. The built-in `chrome-relay` profile
  //     uses the same derived port by design
  //     (src/browser/config.ts:ensureDefaultChromeRelayProfile).
  //   - If `profiles.user.cdpUrl` disagrees, we end up with two relays: the
  //     extension attaches to one, the agent queries the other, and the
  //     connection silently fails.
  //
  // Historical note: migration v5 seeds the `user` profile with a hardcoded
  // `http://127.0.0.1:18792`, which is the legacy default from a time when
  // the gateway had no fixed port and the extension used a fixed
  // DEFAULT_PORT constant. Now that Sigma runs the gateway on a known port
  // (`--gateway-port`), we can — and must — derive the relay URL from it.
  if (typeof gatewayPort === "number" && Number.isFinite(gatewayPort) && gatewayPort > 0) {
    const browser = ensureObject(cfg, "browser");
    const profiles = ensureObject(browser, "profiles");
    const user = asPlainObject(profiles.user);
    const expectedRelayPort = gatewayPort + 3;
    const expectedCdpUrl = `http://127.0.0.1:${expectedRelayPort}`;
    if (user && user.driver === "extension" && user.cdpUrl !== expectedCdpUrl) {
      user.cdpUrl = expectedCdpUrl;
      changed = true;
    }
  }

  // Migrate away from the misplaced `agents.defaults.tools` key that an
  // earlier version of this patcher used to write. The OpenClaw schema
  // rejects it (`agents.defaults` is `.strict()`) and the gateway refuses
  // to start with `Unrecognized key: "tools"`. We always strip it, even
  // when SIGMA_DISABLE_BROWSER_FOCUS=1, because leaving it in place would
  // keep the gateway broken regardless of opt-out intent.
  {
    const agentsRoot = asPlainObject(cfg.agents);
    const defaultsRoot = agentsRoot ? asPlainObject(agentsRoot.defaults) : undefined;
    if (defaultsRoot && Object.prototype.hasOwnProperty.call(defaultsRoot, "tools")) {
      delete defaultsRoot.tools;
      changed = true;
    }
  }

  // Browser-focused tool policy on the ROOT `tools` key (the only place the
  // OpenClaw schema accepts a global tool policy — see zod-schema.ts). Forces
  // the agent to use the `browser` tool (plus read-only helpers) and
  // explicitly denies `web_fetch` / `web_search` / fs / exec / messaging
  // tools so the local LLM can't drift away from the intended use case
  // (driving the user's own browser tabs).
  //
  // We rewrite (not merge) the allow/deny lists every launch so that an old
  // ~/.openclaw/openclaw.json from a previous Sigma version automatically
  // gets the new policy. Set SIGMA_DISABLE_BROWSER_FOCUS=1 to opt out
  // entirely (e.g. when running OpenClaw outside the Sigma browser).
  if (process.env.SIGMA_DISABLE_BROWSER_FOCUS !== "1") {
    const tools = ensureObject(cfg, "tools");
    if (tools.profile !== "minimal") {
      tools.profile = "minimal";
      changed = true;
    }
    if (!arraysEqual(tools.alsoAllow, SIGMA_BROWSER_FOCUS_ALLOW)) {
      tools.alsoAllow = [...SIGMA_BROWSER_FOCUS_ALLOW];
      changed = true;
    }
    if (!arraysEqual(tools.deny, SIGMA_BROWSER_FOCUS_DENY)) {
      tools.deny = [...SIGMA_BROWSER_FOCUS_DENY];
      changed = true;
    }
    // `allow` would conflict with `alsoAllow` in the same scope (the schema
    // explicitly forbids that combination — see addAllowAlsoAllowConflictIssue).
    // Strip it so `profile: minimal` + `alsoAllow` stays in charge.
    if (Object.prototype.hasOwnProperty.call(tools, "allow")) {
      delete tools.allow;
      changed = true;
    }
  }

  // LLM provider + default-agent wiring. Skipped when we don't yet know the
  // llama-server port — writing `http://127.0.0.1:0/v1` would poison the
  // config and force the user to delete it by hand. The browser-profile
  // patch above still ran, so relay routing is kept in sync regardless.
  if (isCloud) {
    // Cloud mode: write an anthropic provider and route the primary agent to it.
    const models = ensureObject(cfg, "models");
    const providers = ensureObject(models, "providers");
    const resolvedCloudModel = cloudModelId ?? "claude-sonnet-4-5-20250929";
    const resolvedCloudUrl = (cloudBaseUrl ?? "https://api.anthropic.com/v1").replace(/\/$/, "");
    const existingAnthropic = asPlainObject(providers["anthropic"]);
    const expectedAnthropicEntry = {
      baseUrl: resolvedCloudUrl,
      apiKey: cloudApiKey!,
      api: "anthropic-messages",
      models: [{ id: resolvedCloudModel, name: resolvedCloudModel, contextWindow: 200000 }],
    };
    if (!existingAnthropic ||
        existingAnthropic.baseUrl !== resolvedCloudUrl ||
        existingAnthropic.apiKey !== cloudApiKey ||
        !Array.isArray(existingAnthropic.models) ||
        (existingAnthropic.models as unknown[])[0] == null ||
        (asPlainObject((existingAnthropic.models as unknown[])[0]) as {id?: unknown} | undefined)?.id !== resolvedCloudModel) {
      providers["anthropic"] = expectedAnthropicEntry;
      changed = true;
    }

    // Flip default agent model to anthropic.
    const agents = ensureObject(cfg, "agents");
    const defaults = ensureObject(agents, "defaults");
    const primaryKey = `anthropic/${resolvedCloudModel}`;
    const model = asPlainObject(defaults.model);
    if (!model || model.primary !== primaryKey) {
      defaults.model = { ...model, primary: primaryKey };
      changed = true;
    }
  } else {
    // Remove stale anthropic provider if cloud was previously active.
    const models = asPlainObject(cfg.models);
    if (models) {
      const providers = asPlainObject(models.providers);
      if (providers && Object.prototype.hasOwnProperty.call(providers, "anthropic")) {
        delete providers["anthropic"];
        changed = true;
      }
    }
  }

  if (llamaPort > 0) {
  const models = ensureObject(cfg, "models");
  const providers = ensureObject(models, "providers");
  const existing = asPlainObject(providers["sigma-local"]);

  // Preference order: explicit param > live llama-server > whatever is already
  // in config > hardcoded fallback. The live probe wins over the stale config
  // entry so that swapping models in llama-server is reflected automatically.
  const resolvedModelId =
    modelId ??
    live?.modelId ??
    extractModelIdFromProvider(existing) ??
    "gemma-3-1b-it";
  const expectedBaseUrl = `http://127.0.0.1:${llamaPort}/v1`;

  // OpenClaw requires a minimum context window of 16000 tokens, otherwise it
  // rejects the model with `FailoverError: Model context window too small`.
  // llama-server must be started with a matching `-c` (or larger) value.
  const MIN_CTX = 16384;
  // Use the live per-slot ctx when available (llama-server splits `-c N` by
  // `--parallel` slots — a chat request only sees n_ctx/slots tokens). Clamp
  // to the OpenClaw minimum so we never advertise a window the gateway will
  // reject.
  const resolvedCtx = Math.max(MIN_CTX, live?.ctxPerSlot ?? MIN_CTX);

  if (!existing) {
    providers["sigma-local"] = {
      baseUrl: expectedBaseUrl,
      api: "openai-completions",
      apiKey: "no-key",
      models: [
        { id: resolvedModelId, name: resolvedModelId, contextWindow: resolvedCtx },
      ],
    };
    changed = true;
  } else {
    if (existing.baseUrl !== expectedBaseUrl) {
      existing.baseUrl = expectedBaseUrl;
      changed = true;
    }
    const existingModels = existing.models;
    if (Array.isArray(existingModels) && existingModels.length > 0) {
      // If the live model id differs from what's recorded, replace the entry
      // wholesale — keeping a stale `id` would cause the extension to request
      // a model name that llama-server no longer serves.
      const first = existingModels[0];
      if (isPlainObject(first)) {
        if (typeof first.id !== "string" || first.id !== resolvedModelId) {
          first.id = resolvedModelId;
          first.name = resolvedModelId;
          changed = true;
        }
        if (typeof first.name !== "string") {
          first.name = resolvedModelId;
          changed = true;
        }
        const ctx = first.contextWindow;
        if (typeof ctx !== "number" || ctx !== resolvedCtx) {
          first.contextWindow = resolvedCtx;
          changed = true;
        }
      }
      for (let i = 1; i < existingModels.length; i++) {
        const m = existingModels[i];
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
    } else {
      existing.models = [
        { id: resolvedModelId, name: resolvedModelId, contextWindow: resolvedCtx },
      ];
      changed = true;
    }
  }

  const agents = ensureObject(cfg, "agents");
  const defaults = ensureObject(agents, "defaults");
  const model = asPlainObject(defaults.model);
  const primaryKey = `sigma-local/${resolvedModelId}`;
  // Force the primary agent model to match the live llama-server model. If we
  // only set it when missing, a stale `sigma-local/gemma-3-1b-it` would keep
  // the agent routing to a model that's no longer served.
  // Only update defaults.model when NOT in cloud mode (cloud block above
  // already set it to `anthropic/<model>`).
  if (!isCloud && (!model || model.primary !== primaryKey)) {
    defaults.model = { ...model, primary: primaryKey };
    changed = true;
  }
  }

  if (changed) {
    fs.writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf-8");
  }
}

interface LiveLlamaInfo {
  modelId: string | null;
  ctxPerSlot: number | null;
}

async function probeLlamaServer(port: number): Promise<LiveLlamaInfo | null> {
  if (!port || port <= 0) {return null;}
  const base = `http://127.0.0.1:${port}`;
  try {
    const [modelsRaw, propsRaw] = await Promise.all([
      fetchJson(`${base}/v1/models`, 1500),
      fetchJson(`${base}/props`, 1500),
    ]);
    const modelId = extractLiveModelId(modelsRaw);
    const ctxPerSlot = extractCtxPerSlot(propsRaw);
    if (modelId == null && ctxPerSlot == null) {return null;}
    return { modelId, ctxPerSlot };
  } catch (err) {
    console.warn("[config-patcher] llama-server probe failed:", err);
    return null;
  }
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => { ctrl.abort(); }, timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {return null;}
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

function extractLiveModelId(raw: unknown): string | null {
  if (!isPlainObject(raw)) {return null;}
  // llama-server emits OpenAI-style `{data:[{id,...}]}` on /v1/models plus a
  // nonstandard `{models:[{model|name,...}]}` mirror. Check both.
  const data = (raw as { data?: unknown }).data;
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    if (isPlainObject(first) && typeof first.id === "string" && first.id.length > 0) {
      return first.id;
    }
  }
  const list = (raw as { models?: unknown }).models;
  if (Array.isArray(list) && list.length > 0) {
    const first = list[0];
    if (isPlainObject(first)) {
      const model = first.model;
      if (typeof model === "string" && model.length > 0) {return model;}
      const name = first.name;
      if (typeof name === "string" && name.length > 0) {return name;}
    }
  }
  return null;
}

function extractCtxPerSlot(raw: unknown): number | null {
  if (!isPlainObject(raw)) {return null;}
  const gs = (raw as { default_generation_settings?: unknown }).default_generation_settings;
  if (!isPlainObject(gs)) {return null;}
  const nCtx = gs.n_ctx;
  if (typeof nCtx !== "number" || !Number.isFinite(nCtx) || nCtx <= 0) {return null;}
  // llama-server's /props reports n_ctx as the PER-SLOT window (total -c N
  // divided by --parallel). Use it as-is: it's exactly what a single chat
  // request gets.
  return Math.floor(nCtx);
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

function arraysEqual(a: unknown, b: readonly string[]): boolean {
  if (!Array.isArray(a) || a.length !== b.length) {return false;}
  for (let i = 0; i < b.length; i++) {
    if (a[i] !== b[i]) {return false;}
  }
  return true;
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

// Sigma Eclipse extension id derived from the deterministic public `key`
// in sigma-eclipse-extension-v2/manifest.json. Stable across rebuilds as
// long as the manifest `key` field is unchanged.
const SIGMA_ECLIPSE_EXTENSION_ID = "ebihdmcdigelnhlkapdcmgdjaieebidk";

function collectRequiredExtensionOrigins(): string[] {
  const ids = new Set<string>([SIGMA_ECLIPSE_EXTENSION_ID]);
  const envIds = process.env.SIGMA_BROWSER_EXTENSION_IDS;
  if (typeof envIds === "string" && envIds.trim().length > 0) {
    for (const raw of envIds.split(",")) {
      const id = raw.trim();
      // Chrome extension ids are 32 lowercase a-p chars.
      if (/^[a-p]{32}$/.test(id)) {
        ids.add(id);
      }
    }
  }
  return [...ids].map((id) => `chrome-extension://${id}`);
}

function mergeOrigins(
  existing: string[],
  required: string[],
): { origins: string[]; changed: boolean } {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of existing) {
    const trimmed = o.trim();
    if (!trimmed || seen.has(trimmed)) {continue;}
    seen.add(trimmed);
    out.push(trimmed);
  }
  let changed = false;
  // Always keep the "null" sentinel — it's what Node's URL.origin collapses
  // chrome-extension:// origins to, so dropping it would break the browser
  // extension's WebSocket handshake on the gateway side.
  if (!seen.has("null")) {
    seen.add("null");
    out.push("null");
    changed = true;
  }
  for (const o of required) {
    if (seen.has(o)) {continue;}
    seen.add(o);
    out.push(o);
    changed = true;
  }
  return { origins: out, changed };
}
