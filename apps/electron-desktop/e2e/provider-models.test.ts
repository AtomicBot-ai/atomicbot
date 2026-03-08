import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  finishOnboarding,
  navigateToSettings,
  gatewayRpc,
  getConfig,
  sendChatMessage,
  waitForAssistantResponse,
  getTestCredentials,
  getSecondProviderCredentials,
} from "./helpers";

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (API Key)",
  openrouter: "OpenRouter",
  google: "Google (Gemini)",
  nvidia: "NVIDIA NIM",
  xai: "xAI (Grok)",
  zai: "Z.ai (GLM)",
  minimax: "MiniMax",
  moonshot: "Moonshot (Kimi)",
  "kimi-coding": "Kimi Coding",
};

function getObj(val: unknown): Record<string, unknown> {
  return val && typeof val === "object" && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

const creds = getTestCredentials();
const secondCreds = getSecondProviderCredentials();

test.describe("Provider addition, model listing, and model switching", () => {
  test.describe.configure({ mode: "serial" });

  let ctx: AppContext;
  let page: Page;

  let originalModelPrimary: string;
  let initialModelCount: number;

  test.skip(
    !creds,
    "No primary API key — create e2e/e2e.config.json (see e2e.config.example.json)"
  );
  test.skip(!secondCreds, "No second provider key — configure 2+ provider keys in e2e.config.json");

  test.beforeAll(async () => {
    ctx = await launchApp();
    page = ctx.page;
  });

  test.afterAll(async () => {
    if (ctx) await closeApp(ctx);
  });

  // ── Onboarding ────────────────────────────────────────────

  test("complete onboarding with default provider", async () => {
    test.setTimeout(120_000);
    await finishOnboarding(page, creds!);
  });

  // ── Record initial state ──────────────────────────────────

  test("record initial model and model count", async () => {
    test.setTimeout(30_000);
    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const agents = getObj(cfg.agents);
    const defaults = getObj(agents.defaults);
    const model = getObj(defaults.model);
    originalModelPrimary = model.primary as string;
    expect(originalModelPrimary).toBeTruthy();

    const result = await gatewayRpc<{
      models: Array<{ id: string; name?: string; provider?: string }>;
    }>(page, "models.list", {});
    initialModelCount = result.models.length;
    expect(initialModelCount).toBeGreaterThan(0);
  });

  // ── Add second provider via Settings UI ───────────────────

  test("navigate to AI Models and add second provider", async () => {
    test.setTimeout(60_000);
    await navigateToSettings(page);

    const tabNav = page.locator('[aria-label="Settings sections"]');
    await tabNav.getByText("AI Models").click();
    await page.waitForTimeout(1_000);

    const displayName = PROVIDER_DISPLAY_NAMES[secondCreds!.provider] ?? secondCreds!.provider;

    // Open the Provider dropdown and select the second provider
    const providerTrigger = page.locator('button[aria-haspopup="listbox"]').first();
    await providerTrigger.click();
    await page.waitForTimeout(500);

    const listbox = page.locator('[role="listbox"]');
    await expect(listbox).toBeVisible({ timeout: 5_000 });
    await listbox.getByText(displayName).click();
    await page.waitForTimeout(1_000);

    // Fill the API key via InlineApiKey section
    const keyInput = page.locator('input[type="password"]');
    await keyInput.waitFor({ state: "visible", timeout: 10_000 });
    await keyInput.fill(secondCreds!.key);
    await page.waitForTimeout(500);

    const saveBtn = page.getByRole("button", { name: /Continue|Save|Connect/ }).last();
    await saveBtn.click();

    await page.waitForTimeout(5_000);
  });

  // ── Verify via RPC ────────────────────────────────────────

  test("config has 2 provider profiles after adding second", async () => {
    test.setTimeout(15_000);
    // Allow time for config to propagate
    await page.waitForTimeout(2_000);

    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const auth = getObj(cfg.auth);
    const profiles = getObj(auth.profiles);

    expect(Object.keys(profiles).length).toBeGreaterThanOrEqual(2);
  });

  test("auth.order includes both providers", async () => {
    test.setTimeout(15_000);
    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const auth = getObj(cfg.auth);
    const order = auth.order;

    expect(order).toBeTruthy();
    const orderKeys = Object.keys(getObj(order));
    expect(orderKeys).toContain(creds!.provider);
    expect(orderKeys).toContain(secondCreds!.provider);
  });

  // ── Verify models list expanded ───────────────────────────

  test("models.list includes models from both providers", async () => {
    test.setTimeout(30_000);
    const result = await gatewayRpc<{
      models: Array<{ id: string; name?: string; provider?: string }>;
    }>(page, "models.list", {});

    expect(result.models.length).toBeGreaterThanOrEqual(initialModelCount);

    const firstProviderModels = result.models.filter((m) => m.provider === creds!.provider);
    expect(firstProviderModels.length).toBeGreaterThan(0);

    const secondProviderModels = result.models.filter((m) => m.provider === secondCreds!.provider);
    expect(secondProviderModels.length).toBeGreaterThan(0);
  });

  // ── Verify models from both providers in UI ───────────────

  test("model dropdown includes models for current provider", async () => {
    test.setTimeout(60_000);
    const tabNav = page.locator('[aria-label="Settings sections"]');
    await tabNav.getByText("AI Models").click();
    await page.waitForTimeout(2_000);

    // Wait for models to load — the trigger text changes from "Select model…"
    const modelTrigger = page.locator('button[aria-haspopup="listbox"]').last();
    await expect(modelTrigger).not.toBeDisabled({ timeout: 15_000 });

    // Retry click until listbox opens (models may still be loading)
    for (let attempt = 0; attempt < 5; attempt++) {
      await modelTrigger.click();
      await page.waitForTimeout(500);
      const listboxes = page.locator('[role="listbox"]');
      const listbox = listboxes.last();
      if (await listbox.isVisible()) {
        const options = listbox.locator('[role="option"]');
        const count = await options.count();
        expect(count).toBeGreaterThanOrEqual(1);
        await page.keyboard.press("Escape");
        return;
      }
      await page.waitForTimeout(2_000);
    }
    throw new Error("Model dropdown never opened with options");
  });

  // ── Switch model to second provider ───────────────────────

  test("switch to a model from the second provider", async () => {
    test.setTimeout(30_000);

    // First switch the provider dropdown to the second provider
    const providerTrigger = page.locator('button[aria-haspopup="listbox"]').first();
    await providerTrigger.click();
    await page.waitForTimeout(500);

    const providerListbox = page.locator('[role="listbox"]').first();
    await expect(providerListbox).toBeVisible({ timeout: 5_000 });

    const displayName = PROVIDER_DISPLAY_NAMES[secondCreds!.provider] ?? secondCreds!.provider;
    await providerListbox.getByText(displayName).click();
    await page.waitForTimeout(1_000);

    // Open the Model dropdown and select the first model
    const modelTrigger = page.locator('button[aria-haspopup="listbox"]').last();
    await modelTrigger.click();
    await page.waitForTimeout(500);

    const modelListbox = page.locator('[role="listbox"]').last();
    await expect(modelListbox).toBeVisible({ timeout: 5_000 });

    const options = modelListbox.locator('[role="option"]');
    const count = await options.count();
    expect(count).toBeGreaterThan(0);
    await options.first().click();

    await page.waitForTimeout(2_000);
  });

  test("config reflects switched model (second provider)", async () => {
    test.setTimeout(30_000);
    // Model switch may trigger config save + gateway reload
    await page.waitForTimeout(3_000);

    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const agents = getObj(cfg.agents);
    const defaults = getObj(agents.defaults);
    const model = getObj(defaults.model);

    const newPrimary = model.primary as string;
    expect(newPrimary).toBeTruthy();
    expect(newPrimary.startsWith(`${secondCreds!.provider}/`)).toBe(true);
  });

  // ── Verify chat works with new model ──────────────────────

  test("chat works with the new model", async () => {
    test.setTimeout(180_000);
    // Navigate to chat
    await page.locator('[aria-label="New session"]').click();
    await page.waitForTimeout(1_000);

    await sendChatMessage(page, "Say OK if you can hear me.");
    const response = await waitForAssistantResponse(page, 120_000);
    expect(response.length).toBeGreaterThan(0);
  });

  // ── Restore original model via RPC ────────────────────────

  test("restore original model via config.patch", async () => {
    test.setTimeout(60_000);

    // After chat streaming, gateway WS may need a moment to accept new
    // connections. Retry with increasing delays.
    async function rpcWithRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
      for (let i = 0; i < retries; i++) {
        try {
          return await fn();
        } catch {
          if (i === retries - 1) throw new Error("RPC failed after retries");
          await page.reload();
          await page.waitForTimeout(3_000 * (i + 1));
        }
      }
      throw new Error("unreachable");
    }

    const snap = await rpcWithRetry(() => getConfig(page));
    await rpcWithRetry(() =>
      gatewayRpc(page, "config.patch", {
        baseHash: snap.hash,
        raw: JSON.stringify({
          agents: { defaults: { model: { primary: originalModelPrimary } } },
        }),
      })
    );
    await page.waitForTimeout(2_000);

    const after = await rpcWithRetry(() => getConfig(page));
    const cfg = getObj(after.config);
    const agents = getObj(cfg.agents);
    const defaults = getObj(agents.defaults);
    const model = getObj(defaults.model);
    expect(model.primary).toBe(originalModelPrimary);
  });
});
