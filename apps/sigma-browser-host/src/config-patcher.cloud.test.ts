/**
 * Unit tests for the cloud-routing extensions added to config-patcher.ts.
 *
 * The patcher reads/writes an `openclaw.json` file.  We work with a temp file
 * so every test is isolated.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { patchSigmaLocalProvider } from "./config-patcher";

const MINIMAL_CONFIG = JSON.stringify({
  gateway: {},
  models: {
    providers: {
      "sigma-local": {
        baseUrl: "http://127.0.0.1:8787/v1",
        api: "openai-completions",
        apiKey: "no-key",
        models: [{ id: "gemma-3-1b-it", name: "gemma-3-1b-it", contextWindow: 32768 }],
      },
    },
  },
  agents: {
    defaults: {
      model: { primary: "sigma-local/gemma-3-1b-it" },
    },
  },
});

let tmpDir: string;
let configPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sigma-config-patcher-test-"));
  configPath = path.join(tmpDir, "openclaw.json");
  fs.writeFileSync(configPath, MINIMAL_CONFIG, "utf-8");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function readConfig(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
}

describe("config-patcher cloud routing", () => {
  it("adds anthropic provider and flips defaults.model when cloud is active", async () => {
    await patchSigmaLocalProvider({
      configPath,
      llamaPort: 8787,
      cloudProvider: "anthropic",
      cloudApiKey: "sk-ant-test-key",
      cloudModelId: "claude-sonnet-4-5-20250929",
      cloudBaseUrl: "https://api.anthropic.com/v1",
    });

    const cfg = readConfig();
    const providers = (cfg.models as Record<string, unknown>)
      .providers as Record<string, unknown>;

    expect(providers).toHaveProperty("anthropic");
    const anthropic = providers["anthropic"] as Record<string, unknown>;
    expect(anthropic.api).toBe("anthropic-messages");
    expect(anthropic.apiKey).toBe("sk-ant-test-key");
    expect(anthropic.baseUrl).toBe("https://api.anthropic.com/v1");
    const models = anthropic.models as Array<{ id: string; contextWindow: number }>;
    expect(models[0]?.id).toBe("claude-sonnet-4-5-20250929");
    expect(models[0]?.contextWindow).toBe(200000);

    const defaults = ((cfg.agents as Record<string, unknown>).defaults as Record<string, unknown>);
    expect((defaults.model as Record<string, unknown>).primary).toBe(
      "anthropic/claude-sonnet-4-5-20250929",
    );
  });

  it("removes anthropic provider and restores sigma-local route when cloud is off", async () => {
    // First enable cloud.
    await patchSigmaLocalProvider({
      configPath,
      llamaPort: 8787,
      cloudProvider: "anthropic",
      cloudApiKey: "sk-ant-test-key",
      cloudModelId: "claude-sonnet-4-5-20250929",
      cloudBaseUrl: "https://api.anthropic.com/v1",
    });

    // Now disable cloud (no cloudProvider / cloudApiKey).
    await patchSigmaLocalProvider({
      configPath,
      llamaPort: 8787,
    });

    const cfg = readConfig();
    const providers = (cfg.models as Record<string, unknown>)
      .providers as Record<string, unknown>;

    expect(providers).not.toHaveProperty("anthropic");
    const defaults = ((cfg.agents as Record<string, unknown>).defaults as Record<string, unknown>);
    const primary = (defaults.model as Record<string, unknown>).primary as string;
    expect(primary.startsWith("sigma-local/")).toBe(true);
  });

  it("does not add anthropic provider when provider is 'none'", async () => {
    await patchSigmaLocalProvider({
      configPath,
      llamaPort: 8787,
      cloudProvider: "none",
      cloudApiKey: "sk-ant-test-key",
      cloudModelId: "claude-sonnet-4-5-20250929",
    });

    const cfg = readConfig();
    const providers = (cfg.models as Record<string, unknown>)
      .providers as Record<string, unknown>;
    expect(providers).not.toHaveProperty("anthropic");
  });

  it("does not add anthropic provider when api key is empty", async () => {
    await patchSigmaLocalProvider({
      configPath,
      llamaPort: 8787,
      cloudProvider: "anthropic",
      cloudApiKey: "",
      cloudModelId: "claude-sonnet-4-5-20250929",
    });

    const cfg = readConfig();
    const providers = (cfg.models as Record<string, unknown>)
      .providers as Record<string, unknown>;
    expect(providers).not.toHaveProperty("anthropic");
  });

  it("sigma-local provider still updated with new llamaPort when cloud is active", async () => {
    await patchSigmaLocalProvider({
      configPath,
      llamaPort: 9999,
      cloudProvider: "anthropic",
      cloudApiKey: "sk-ant-test-key",
      cloudModelId: "claude-haiku-4-5-20250929",
      cloudBaseUrl: "https://api.anthropic.com/v1",
    });

    const cfg = readConfig();
    const providers = (cfg.models as Record<string, unknown>)
      .providers as Record<string, unknown>;

    // sigma-local should still reflect the live llama port.
    const local = providers["sigma-local"] as Record<string, unknown>;
    expect((local.baseUrl as string).includes("9999")).toBe(true);

    // And anthropic should be wired.
    expect(providers).toHaveProperty("anthropic");
  });

  it("AIMLAPI provider uses openai-completions api family", async () => {
    await patchSigmaLocalProvider({
      configPath,
      llamaPort: 8787,
      cloudProvider: "aimlapi",
      cloudApiKey: "test-aimlapi-key",
      cloudModelId: "claude-sonnet-4-5",
      cloudBaseUrl: "https://api.aimlapi.com/v1",
    });

    const cfg = readConfig();
    const providers = (cfg.models as Record<string, unknown>)
      .providers as Record<string, unknown>;

    expect(providers).toHaveProperty("aimlapi");
    expect(providers).not.toHaveProperty("anthropic");
    const entry = providers["aimlapi"] as Record<string, unknown>;
    expect(entry.api).toBe("openai-completions");
    expect(entry.baseUrl).toBe("https://api.aimlapi.com/v1");
    expect(entry.apiKey).toBe("test-aimlapi-key");

    const defaults = ((cfg.agents as Record<string, unknown>).defaults as Record<string, unknown>);
    expect((defaults.model as Record<string, unknown>).primary).toBe(
      "aimlapi/claude-sonnet-4-5",
    );
  });

  it("OpenRouter provider uses openai-completions and correct key", async () => {
    await patchSigmaLocalProvider({
      configPath,
      llamaPort: 8787,
      cloudProvider: "openrouter",
      cloudApiKey: "sk-or-v1-test",
      cloudModelId: "anthropic/claude-sonnet-4-5",
      cloudBaseUrl: "https://openrouter.ai/api/v1",
    });

    const cfg = readConfig();
    const providers = (cfg.models as Record<string, unknown>)
      .providers as Record<string, unknown>;

    expect(providers).toHaveProperty("openrouter");
    const entry = providers["openrouter"] as Record<string, unknown>;
    expect(entry.api).toBe("openai-completions");
    expect((defaults(cfg).model as Record<string, unknown>).primary).toBe(
      "openrouter/anthropic/claude-sonnet-4-5",
    );
  });

  it("custom provider uses openai-completions and caller-supplied baseUrl", async () => {
    await patchSigmaLocalProvider({
      configPath,
      llamaPort: 8787,
      cloudProvider: "custom",
      cloudApiKey: "my-local-key",
      cloudModelId: "my-model-id",
      cloudBaseUrl: "http://localhost:11434/v1",
    });

    const cfg = readConfig();
    const providers = (cfg.models as Record<string, unknown>)
      .providers as Record<string, unknown>;

    expect(providers).toHaveProperty("custom");
    const entry = providers["custom"] as Record<string, unknown>;
    expect(entry.api).toBe("openai-completions");
    expect(entry.baseUrl).toBe("http://localhost:11434/v1");
    expect((defaults(cfg).model as Record<string, unknown>).primary).toBe("custom/my-model-id");
  });

  it("cloud-off cleans up ALL known cloud providers in one pass", async () => {
    // Pre-seed the config with multiple cloud provider entries as if two
    // consecutive provider switches happened without a clean-off in between.
    const cfg = readConfig();
    const providers = ((cfg.models as Record<string, unknown>).providers as Record<string, unknown>);
    providers["anthropic"] = { api: "anthropic-messages", baseUrl: "x", apiKey: "x", models: [] };
    providers["aimlapi"]   = { api: "openai-completions", baseUrl: "x", apiKey: "x", models: [] };
    providers["openrouter"]= { api: "openai-completions", baseUrl: "x", apiKey: "x", models: [] };
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf-8");

    // Disable cloud.
    await patchSigmaLocalProvider({ configPath, llamaPort: 8787 });

    const after = readConfig();
    const afterProviders = ((after.models as Record<string, unknown>).providers as Record<string, unknown>);
    expect(afterProviders).not.toHaveProperty("anthropic");
    expect(afterProviders).not.toHaveProperty("aimlapi");
    expect(afterProviders).not.toHaveProperty("openrouter");
    expect(afterProviders).toHaveProperty("sigma-local");
  });

  it("switching from anthropic to aimlapi removes stale anthropic entry", async () => {
    // Enable anthropic first.
    await patchSigmaLocalProvider({
      configPath,
      llamaPort: 8787,
      cloudProvider: "anthropic",
      cloudApiKey: "sk-ant-key",
      cloudModelId: "claude-sonnet-4-5-20250929",
      cloudBaseUrl: "https://api.anthropic.com/v1",
    });

    // Now switch to aimlapi.
    await patchSigmaLocalProvider({
      configPath,
      llamaPort: 8787,
      cloudProvider: "aimlapi",
      cloudApiKey: "aimlapi-key",
      cloudModelId: "deepseek-chat",
      cloudBaseUrl: "https://api.aimlapi.com/v1",
    });

    const cfg = readConfig();
    const providers = (cfg.models as Record<string, unknown>)
      .providers as Record<string, unknown>;

    expect(providers).not.toHaveProperty("anthropic");
    expect(providers).toHaveProperty("aimlapi");
    expect((defaults(cfg).model as Record<string, unknown>).primary).toBe("aimlapi/deepseek-chat");
  });
});

function defaults(cfg: Record<string, unknown>): Record<string, unknown> {
  return ((cfg.agents as Record<string, unknown>).defaults as Record<string, unknown>);
}
