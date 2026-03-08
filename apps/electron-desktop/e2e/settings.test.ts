import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  finishOnboarding,
  navigateToSettings,
  getConfig,
  getTestCredentials,
  getSecondProviderCredentials,
} from "./helpers";

const creds = getTestCredentials();

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

test.describe("Settings page", () => {
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

  test("navigate to settings and see tabs", async () => {
    test.setTimeout(120_000);
    await finishOnboarding(page, creds!);
    await navigateToSettings(page);

    await expect(page.locator('[aria-label="Settings page"]')).toBeVisible();

    const tabNav = page.locator('[aria-label="Settings sections"]');
    for (const tabName of ["AI Models", "Messengers", "Skills", "Voice", "Other"]) {
      await expect(tabNav.getByText(tabName)).toBeVisible();
    }
  });

  test("switch between settings tabs", async () => {
    test.setTimeout(60_000);
    const tabNav = page.locator('[aria-label="Settings sections"]');

    await tabNav.getByText("AI Models").click();
    await expect(page.locator('button[aria-haspopup="listbox"]').first()).toBeVisible({
      timeout: 15_000,
    });

    await tabNav.getByText("Messengers").click();
    await expect(page.locator('[role="group"][aria-label="Telegram"]')).toBeVisible({
      timeout: 15_000,
    });

    await tabNav.getByText("Skills").click();
    await expect(page.getByPlaceholder("Search by skills…")).toBeVisible({ timeout: 15_000 });

    await tabNav.getByText("Other").click();
    await expect(page.locator('[aria-label="Launch at startup"]')).toBeVisible({ timeout: 15_000 });
  });

  test("change default model via settings", async () => {
    test.setTimeout(60_000);
    const tabNav = page.locator('[aria-label="Settings sections"]');
    await tabNav.getByText("AI Models").click();
    await page.waitForTimeout(1_000);

    // Open the Model dropdown (RichSelect)
    const modelTrigger = page.locator('button[aria-haspopup="listbox"]').last();
    await modelTrigger.click();
    await page.waitForTimeout(500);

    const listbox = page.locator('[role="listbox"]').last();
    await expect(listbox).toBeVisible({ timeout: 5_000 });
    const options = listbox.locator('[role="option"]');
    const count = await options.count();
    if (count < 2) {
      test.skip(true, "Only one model available, cannot test switching");
      return;
    }

    const snapBefore = await getConfig(page);
    const cfgBefore = getObj(snapBefore.config);
    const agentsBefore = getObj(cfgBefore.agents);
    const defaultsBefore = getObj(agentsBefore.defaults);
    const modelBefore = getObj(defaultsBefore.model);
    const originalModel = modelBefore.primary;

    // Select the first non-selected option
    const nonActive = listbox.locator('[role="option"]:not([aria-selected="true"])').first();
    await nonActive.click();
    await page.waitForTimeout(2_000);

    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const agents = getObj(cfg.agents);
    const defaults = getObj(agents.defaults);
    const model = getObj(defaults.model);
    expect(model.primary).not.toBe(originalModel);
  });

  test("add second provider", async () => {
    const secondCreds = getSecondProviderCredentials();
    test.skip(!secondCreds, "Need 2+ provider keys in e2e.config.json");
    test.setTimeout(60_000);

    const tabNav = page.locator('[aria-label="Settings sections"]');
    await tabNav.getByText("AI Models").click();
    await page.waitForTimeout(1_000);

    // Open the Provider dropdown and select the second provider
    const providerTrigger = page.locator('button[aria-haspopup="listbox"]').first();
    await providerTrigger.click();
    await page.waitForTimeout(500);

    const displayName = PROVIDER_DISPLAY_NAMES[secondCreds!.provider] ?? secondCreds!.provider;
    const listbox = page.locator('[role="listbox"]').first();
    await expect(listbox).toBeVisible({ timeout: 5_000 });
    await listbox.getByText(displayName).click();
    await page.waitForTimeout(1_000);

    // Fill the API key in the InlineApiKey section
    const keyInput = page.locator('input[type="password"]');
    await keyInput.waitFor({ state: "visible", timeout: 10_000 });
    await keyInput.fill(secondCreds!.key);
    await page.waitForTimeout(500);

    const submitBtn = page
      .getByRole("button", {
        name: /Continue|Save|Connect/,
      })
      .last();
    await submitBtn.click();

    await page.waitForTimeout(5_000);

    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const auth = getObj(cfg.auth);
    const profiles = getObj(auth.profiles);
    expect(Object.keys(profiles).length).toBeGreaterThanOrEqual(2);
  });

  test("navigate back to chat from settings", async () => {
    test.setTimeout(15_000);
    await page.locator('[aria-label="New session"]').click();

    await expect(page.getByText("What can I help with?")).toBeVisible({ timeout: 10_000 });
  });
});
