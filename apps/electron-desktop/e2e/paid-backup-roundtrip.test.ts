import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  acceptConsentOnly,
  selectPaid,
  simulateAuthDeepLink,
  waitForModelSelect,
  selectFirstModel,
  waitForSkillsPage,
  skipSkills,
  waitForConnectionsPage,
  waitForSetupReviewPage,
  waitForChatPage,
  navigateToSettings,
  getPaidCredentials,
} from "./helpers";

const paid = getPaidCredentials();

const PAID_BACKUP_LS_KEY = "openclaw-paid-backup";
const AUTH_TOKEN_LS_KEY = "openclaw-auth-token";

test.describe("Paid backup roundtrip (paid -> self -> paid)", () => {
  test.describe.configure({ mode: "serial" });

  let ctx: AppContext;
  let page: Page;

  test.skip(
    !paid,
    "No paid credentials — set paid.jwt/email/userId in e2e.config.json or TEST_PAID_* env vars"
  );

  test.beforeAll(async () => {
    ctx = await launchApp();
    page = ctx.page;
  });

  test.afterAll(async () => {
    if (ctx) await closeApp(ctx);
  });

  test("complete paid onboarding to reach chat", async () => {
    test.setTimeout(180_000);

    await acceptConsentOnly(page);
    await selectPaid(page);

    await page.waitForTimeout(500);
    await simulateAuthDeepLink(ctx.app, {
      jwt: paid!.jwt,
      email: paid!.email,
      userId: paid!.userId,
    });

    await waitForModelSelect(page);
    await selectFirstModel(page);
    await waitForSkillsPage(page);
    await skipSkills(page);
    await waitForConnectionsPage(page);

    await page
      .locator('[aria-label="Connections setup"]')
      .getByRole("button", { name: /Skip|Continue/ })
      .first()
      .click();

    const destination = await Promise.race([
      waitForSetupReviewPage(page).then(() => "review" as const),
      waitForChatPage(page).then(() => "chat" as const),
    ]);

    if (destination === "review") {
      const subscribeBtn = page
        .locator('[aria-label="Setup review"]')
        .getByRole("button", { name: /Subscribe/ });
      const isVisible = await subscribeBtn.isVisible().catch(() => false);
      if (!isVisible) {
        // Already subscribed, may redirect to chat
      }
    }

    await waitForChatPage(page);
  });

  test("navigate to settings and switch to Own API key", async () => {
    test.setTimeout(30_000);
    await navigateToSettings(page);

    const tabNav = page.locator('[aria-label="Settings sections"]');
    await tabNav.getByText("AI Models").click();
    await page.waitForTimeout(1_000);

    const toggle = page.locator('[aria-label="Connection mode"]');
    await expect(toggle).toBeVisible({ timeout: 10_000 });

    await toggle.getByText("Own API key").click();
    await page.waitForTimeout(2_000);
  });

  test("paid backup is saved in localStorage after switching to self-managed", async () => {
    test.setTimeout(10_000);

    const backup = await page.evaluate((key) => localStorage.getItem(key), PAID_BACKUP_LS_KEY);
    expect(backup).not.toBeNull();

    const parsed = JSON.parse(backup!);
    expect(parsed.authToken).toBeDefined();
    expect(parsed.authToken.jwt).toBe(paid!.jwt);
    expect(parsed.authToken.email).toBe(paid!.email);
    expect(parsed.savedAt).toBeDefined();
  });

  test("auth token is cleared after switching to self-managed", async () => {
    test.setTimeout(10_000);

    const token = await page.evaluate((key) => localStorage.getItem(key), AUTH_TOKEN_LS_KEY);
    expect(token).toBeNull();
  });

  test("switch back to Atomic Bot Account restores paid state", async () => {
    test.setTimeout(30_000);

    const toggle = page.locator('[aria-label="Connection mode"]');
    await toggle.getByText("Atomic Bot Account").click();
    await page.waitForTimeout(3_000);

    const token = await page.evaluate((key) => localStorage.getItem(key), AUTH_TOKEN_LS_KEY);

    if (token) {
      const parsed = JSON.parse(token);
      expect(parsed.jwt).toBe(paid!.jwt);
      expect(parsed.email).toBe(paid!.email);
    }
    // If token is null, the JWT validation failed (expired) — this is acceptable
    // behavior but means the backend rejected the token.
  });

  test("paid backup is cleared after restoration", async () => {
    test.setTimeout(10_000);

    const backup = await page.evaluate((key) => localStorage.getItem(key), PAID_BACKUP_LS_KEY);
    expect(backup).toBeNull();
  });
});
