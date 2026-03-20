import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  finishOnboarding,
  gatewayRpc,
  getConfig,
  sendChatMessage,
  waitForAssistantResponse,
  getTestCredentials,
} from "./helpers";

const creds = getTestCredentials();

function getObj(val: unknown): Record<string, unknown> {
  return val && typeof val === "object" && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

test.describe("Gateway core RPC", () => {
  test.describe.configure({ mode: "serial" });

  let ctx: AppContext;
  let page: Page;

  test.skip(!creds, "No API key — create e2e/e2e.config.json (see e2e.config.example.json)");

  test.beforeAll(async () => {
    ctx = await launchApp();
    page = ctx.page;
  });

  test.afterAll(async () => {
    if (ctx) await closeApp(ctx);
  });

  test("complete onboarding", async () => {
    test.setTimeout(120_000);
    await finishOnboarding(page, creds!);
  });

  // ── Config roundtrip ──────────────────────────────────────

  test("config.get returns valid snapshot", async () => {
    test.setTimeout(30_000);
    const snap = await getConfig(page);

    expect(snap.hash).toBeTruthy();
    expect(typeof snap.hash).toBe("string");
    const cfg = getObj(snap.config);
    expect(cfg.auth).toBeTruthy();
    expect(cfg.agents).toBeTruthy();
    expect(cfg.gateway).toBeTruthy();
  });

  test("config.patch applies changes and hash updates", async () => {
    test.setTimeout(30_000);
    const before = await getConfig(page);
    const cfg = getObj(before.config);
    const agents = getObj(cfg.agents);
    const defaults = getObj(agents.defaults);
    const oldMaxDim =
      typeof defaults.imageMaxDimensionPx === "number" ? defaults.imageMaxDimensionPx : 1200;

    const newMaxDim = oldMaxDim === 1100 ? 1200 : 1100;

    const patchResult = await gatewayRpc<{ ok: boolean; config: Record<string, unknown> }>(
      page,
      "config.patch",
      {
        baseHash: before.hash,
        raw: JSON.stringify({
          agents: { defaults: { imageMaxDimensionPx: newMaxDim } },
        }),
      }
    );
    expect(patchResult.ok).toBe(true);

    // Re-read config and verify the change persisted
    const after = await getConfig(page);
    expect(after.hash).not.toBe(before.hash);

    const afterCfg = getObj(after.config);
    const afterAgents = getObj(afterCfg.agents);
    const afterDefaults = getObj(afterAgents.defaults);
    expect(afterDefaults.imageMaxDimensionPx).toBe(newMaxDim);

    // Restore original value
    await gatewayRpc(page, "config.patch", {
      baseHash: after.hash,
      raw: JSON.stringify({
        agents: { defaults: { imageMaxDimensionPx: oldMaxDim } },
      }),
    });
  });

  test("config.patch with stale hash fails (optimistic concurrency)", async () => {
    test.setTimeout(30_000);

    // Use the original hash which is now stale after the previous test's patches
    let error: Error | null = null;
    try {
      await gatewayRpc(page, "config.patch", {
        baseHash: "stale-hash-that-does-not-match",
        raw: JSON.stringify({ agents: { defaults: { model: { temperature: 0.99 } } } }),
      });
    } catch (e) {
      error = e as Error;
    }

    expect(error).toBeTruthy();
    expect(error!.message).toBeTruthy();
  });

  // ── Sessions CRUD ─────────────────────────────────────────

  test("sessions.list returns sessions array", async () => {
    test.setTimeout(30_000);
    const result = await gatewayRpc<{ sessions: unknown[] }>(page, "sessions.list", {
      includeDerivedTitles: true,
    });
    expect(Array.isArray(result.sessions)).toBe(true);
  });

  test("session title matches first user message", async () => {
    test.setTimeout(180_000);

    await page.locator('[aria-label="New session"]').click();
    await page.waitForTimeout(1_000);

    await sendChatMessage(page, "My unique test phrase ABC123");
    await waitForAssistantResponse(page, 120_000);

    // Allow gateway time to persist the session metadata
    await page.waitForTimeout(3_000);

    const result = await gatewayRpc<{
      sessions: Array<{ key: string; derivedTitle?: string }>;
    }>(page, "sessions.list", { includeDerivedTitles: true });

    const match = result.sessions.find(
      (s) => s.derivedTitle && s.derivedTitle.includes("My unique test phrase ABC123")
    );
    expect(match).toBeTruthy();
  });

  test("sessions.delete removes session", async () => {
    test.setTimeout(30_000);

    const before = await gatewayRpc<{
      sessions: Array<{ key: string }>;
    }>(page, "sessions.list", {});
    const countBefore = before.sessions.length;
    expect(countBefore).toBeGreaterThanOrEqual(1);

    // Find a non-main session to delete
    const toDelete = before.sessions.find((s) => s.key !== "main");
    if (!toDelete) {
      test.skip(true, "No non-main session to delete");
      return;
    }

    await gatewayRpc(page, "sessions.delete", { key: toDelete.key });

    const after = await gatewayRpc<{ sessions: Array<{ key: string }> }>(page, "sessions.list", {});
    expect(after.sessions.length).toBeLessThan(countBefore);
  });

  // ── Channels status ───────────────────────────────────────

  test("channels.status returns channel data", async () => {
    test.setTimeout(30_000);
    const result = await gatewayRpc<{ channels: Record<string, unknown> }>(
      page,
      "channels.status",
      { probe: false, timeoutMs: 5000 }
    );
    expect(result.channels).toBeTruthy();
    expect(typeof result.channels).toBe("object");
  });

  // ── Models listing ────────────────────────────────────────

  test("models.list returns available models", async () => {
    test.setTimeout(30_000);
    const result = await gatewayRpc<{
      models: Array<{ id: string; name?: string; provider?: string }>;
    }>(page, "models.list", {});

    expect(Array.isArray(result.models)).toBe(true);
    expect(result.models.length).toBeGreaterThan(0);
    expect(result.models[0].id).toBeTruthy();
  });
});
