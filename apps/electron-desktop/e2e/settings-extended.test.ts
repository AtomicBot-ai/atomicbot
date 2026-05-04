import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  finishOnboarding,
  navigateToSettings,
  getTestCredentials,
} from "./helpers";

const creds = getTestCredentials();

test.describe("Settings — extended tabs", () => {
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

  test("complete onboarding and open settings", async () => {
    test.setTimeout(120_000);
    await finishOnboarding(page, creds!);
    await navigateToSettings(page);
    await expect(page.locator('[aria-label="Settings page"]')).toBeVisible();
  });

  // ---- Voice tab ----

  test("voice tab shows provider options", async () => {
    test.setTimeout(30_000);
    const tabNav = page.locator('[aria-label="Settings sections"]');
    await tabNav.getByText("Voice").click();

    await expect(page.getByText("Voice Recognition")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /OpenAI Whisper/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Local Whisper/ })).toBeVisible();
  });

  test("selecting Local Whisper shows model list", async () => {
    test.setTimeout(30_000);
    await page.getByRole("button", { name: /Local Whisper/ }).click();
    await page.waitForTimeout(1_000);

    await expect(page.getByText("Select Whisper model")).toBeVisible({ timeout: 10_000 });
    const modelRadios = page.locator('[role="radio"]');
    const count = await modelRadios.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("selecting OpenAI Whisper without key shows key input", async () => {
    test.setTimeout(30_000);
    await page.getByRole("button", { name: /OpenAI Whisper/ }).click();
    await page.waitForTimeout(1_000);

    // If OpenAI is not configured, a key input should be shown
    const needsKey = await page
      .getByText("OpenAI is not configured")
      .isVisible()
      .catch(() => false);
    if (needsKey) {
      await expect(page.getByText("OpenAI API key")).toBeVisible();
      const saveBtn = page.getByRole("button", { name: "Save key" });
      await expect(saveBtn).toBeVisible();
    }
    // If OpenAI is already configured, "API key configured" text should appear
    const configured = await page
      .getByText("API key configured")
      .isVisible()
      .catch(() => false);
    expect(needsKey || configured).toBe(true);
  });

  // ---- Other tab ----

  test("other tab shows app version", async () => {
    test.setTimeout(30_000);
    const tabNav = page.locator('[aria-label="Settings sections"]');
    await tabNav.getByText("Other").click();

    await expect(page.getByText(/Atomic Claw v\d/)).toBeVisible({ timeout: 10_000 });
  });

  test("other tab shows launch at startup toggle", async () => {
    test.setTimeout(15_000);
    const toggle = page.locator('[aria-label="Launch at startup"]');
    await expect(toggle).toBeVisible();

    const checkbox = toggle.locator('input[type="checkbox"]');
    await expect(checkbox).toBeAttached();
  });

  test("other tab shows backup section", async () => {
    test.setTimeout(15_000);
    await expect(page.getByRole("heading", { name: "Backup" })).toBeVisible();
    await expect(page.getByText("Save to file")).toBeVisible();
    await expect(page.getByText("Choose file")).toBeVisible();
  });

  test("other tab shows folders section", async () => {
    test.setTimeout(15_000);
    await expect(page.getByText("Folders")).toBeVisible();
    await expect(page.getByText("OpenClaw folder")).toBeVisible();
    await expect(page.getByText("Agent workspace")).toBeVisible();

    const openFolderBtns = page.getByText("Open folder");
    const count = await openFolderBtns.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("other tab shows terminal section with sidebar toggle", async () => {
    test.setTimeout(15_000);
    await expect(page.getByRole("heading", { name: "Terminal" })).toBeVisible();

    const termToggle = page.locator('[aria-label="Show terminal in sidebar"]');
    await expect(termToggle).toBeVisible();

    await expect(page.getByText("Open Terminal")).toBeVisible();
  });

  test("terminal sidebar toggle can be switched on", async () => {
    test.setTimeout(15_000);
    const termToggle = page.locator('[aria-label="Show terminal in sidebar"]');
    const checkbox = termToggle.locator('input[type="checkbox"]');

    const wasBefore = await checkbox.isChecked();
    if (!wasBefore) {
      await termToggle.click();
      await page.waitForTimeout(500);
    }
    expect(await checkbox.isChecked()).toBe(true);

    // Restore original state if it was unchecked
    if (!wasBefore) {
      await termToggle.click();
      await page.waitForTimeout(500);
    }
  });

  test("other tab shows reset / sign out button", async () => {
    test.setTimeout(15_000);
    await expect(page.getByText("Account")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset and sign out" })).toBeVisible();
  });

  test("other tab shows external links", async () => {
    test.setTimeout(15_000);
    await expect(page.getByText("License")).toBeVisible();
    await expect(page.getByText("PolyForm Noncommercial 1.0.0")).toBeVisible();
    await expect(page.getByText("GitHub")).toBeVisible();
    await expect(page.getByText("Website")).toBeVisible();
    await expect(page.getByText("Discord")).toBeVisible();
  });

  test("legacy UI link is present", async () => {
    test.setTimeout(15_000);
    await expect(page.getByText("Legacy UI Dashboard")).toBeVisible();
  });
});
