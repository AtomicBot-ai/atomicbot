import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  waitForConnectionsPage,
  getConfig,
  getTestCredentials,
  getTelegramConfig,
  runOnboardingToConnections,
} from "./helpers";

const creds = getTestCredentials();
const tg = getTelegramConfig();

const BOT_TOKEN = tg.botToken || "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg";
const USER_ID = tg.userId || "987654321";

function getObj(val: unknown): Record<string, unknown> {
  return val && typeof val === "object" && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

test.describe("Telegram setup during onboarding", () => {
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

  test("navigate through onboarding to connections page", async () => {
    test.setTimeout(120_000);
    await runOnboardingToConnections(page, creds!);
    await expect(page.getByText("Set Up Connections")).toBeVisible();
  });

  test("click Connect on Telegram -> telegram token page", async () => {
    const telegramCard = page.locator('[role="group"][aria-label="Telegram"]');
    await telegramCard.getByText("Connect").click();

    const tokenPage = page.locator('[aria-label="Telegram token setup"]');
    await tokenPage.waitFor({ state: "visible", timeout: 15_000 });
    await expect(page.getByText("Connect Telegram")).toBeVisible();
  });

  test("enter bot token and navigate to user ID page", async () => {
    const input = page.locator('[aria-label="Telegram token setup"] input[type="password"]');
    await input.fill(BOT_TOKEN);
    await page
      .locator('[aria-label="Telegram token setup"]')
      .getByRole("button", { name: "Continue" })
      .click();

    const userPage = page.locator('[aria-label="Telegram allowlist setup"]');
    await userPage.waitFor({ state: "visible", timeout: 30_000 });
    await expect(page.getByText("Allow Telegram DMs")).toBeVisible();
  });

  test("verify config: telegram enabled with bot token", async () => {
    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const channels = getObj(cfg.channels);
    const telegram = getObj(channels.telegram);
    expect(telegram.enabled).toBe(true);
    // Gateway redacts sensitive values in config.get
    expect(typeof telegram.botToken).toBe("string");
    expect(telegram.botToken).toBeTruthy();
  });

  test("enter user ID and connect", async () => {
    const input = page.locator('[aria-label="Telegram allowlist setup"] input');
    await input.fill(USER_ID);
    await page
      .locator('[aria-label="Telegram allowlist setup"]')
      .getByRole("button", { name: "Connect" })
      .click();

    await waitForConnectionsPage(page);
  });

  test("verify config: telegram allowFrom contains user ID", async () => {
    test.setTimeout(30_000);
    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const channels = getObj(cfg.channels);
    const telegram = getObj(channels.telegram);

    expect(telegram.enabled).toBe(true);
    expect(telegram.dmPolicy).toBe("allowlist");

    const allowFrom = telegram.allowFrom;
    expect(Array.isArray(allowFrom)).toBe(true);
    expect(allowFrom).toContain(USER_ID);
  });

  test("telegram shows as connected on connections page", async () => {
    const telegramCard = page.locator('[role="group"][aria-label="Telegram"]');
    await expect(telegramCard.getByText("Connected", { exact: false })).toBeVisible();
  });
});
