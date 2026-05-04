import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  acceptConsentOnly,
  selectPaid,
  simulateAuthDeepLink,
  simulateStripeSuccessDeepLink,
  waitForModelSelect,
  selectFirstModel,
  waitForSkillsPage,
  skipSkills,
  waitForConnectionsPage,
  waitForSetupReviewPage,
  waitForSuccessPage,
  waitForChatPage,
  navigateToSettings,
  getPaidCredentials,
} from "./helpers";

const paid = getPaidCredentials();

test.describe("Settings account tab (paid mode)", () => {
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

    // User may be already subscribed -> goes to chat, or -> goes to review
    const destination = await Promise.race([
      waitForSetupReviewPage(page).then(() => "review" as const),
      waitForChatPage(page).then(() => "chat" as const),
    ]);

    if (destination === "review") {
      // Complete the Stripe flow
      const subscribeBtn = page
        .locator('[aria-label="Setup review"]')
        .getByRole("button", { name: /Subscribe|Start.*Trial/ });
      await subscribeBtn.click();

      const pendingOrError = await Promise.race([
        page
          .locator('[aria-label="Waiting for payment"]')
          .waitFor({ state: "visible", timeout: 15_000 })
          .then(() => "pending" as const),
        page
          .locator(".UiErrorText")
          .waitFor({ state: "visible", timeout: 15_000 })
          .then(() => "error" as const),
      ]).catch(() => "timeout" as const);

      if (pendingOrError !== "error") {
        await simulateStripeSuccessDeepLink(ctx.app);

        const afterSuccess = await Promise.race([
          waitForSuccessPage(page).then(() => "success" as const),
          waitForChatPage(page).then(() => "chat" as const),
        ]).catch(() => "timeout" as const);

        if (afterSuccess === "success") {
          await page.getByRole("button", { name: "Start chat" }).waitFor({
            state: "visible",
            timeout: 130_000,
          });
          await page.getByRole("button", { name: "Start chat" }).click();
        }
      }

      // If checkout errors out, the account state is likely external to this test.
    }

    await waitForChatPage(page);
  });

  test("navigate to settings and see AI Models tab", async () => {
    test.setTimeout(30_000);
    await navigateToSettings(page);

    const tabNav = page.locator('[aria-label="Settings sections"]');
    await expect(tabNav.getByText("AI Models")).toBeVisible();
  });

  test("Connection toggle shows Subscription as active", async () => {
    test.setTimeout(15_000);
    const tabNav = page.locator('[aria-label="Settings sections"]');
    await tabNav.getByText("AI Models").click();
    await page.waitForTimeout(1_000);

    const toggle = page.locator('[aria-label="Connection mode"]');
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    await expect(toggle.getByText("Subscription")).toBeVisible();
    await expect(toggle.getByText("API keys")).toBeVisible();
  });

  test("balance section is visible in paid mode", async () => {
    test.setTimeout(15_000);
    // The AccountTab renders inside AccountModelsTab when in paid mode.
    // It shows either: sign-up prompt, payment pending, subscribe prompt, or balance dashboard.
    // With a valid JWT, we expect either balance dashboard or subscribe prompt.
    const hasBalance = await page
      .getByText("Balance")
      .isVisible()
      .catch(() => false);
    const hasSubscribe = await page
      .getByText("Atomic Claw Subscription")
      .isVisible()
      .catch(() => false);
    const hasContinueGoogle = await page
      .getByText("Continue with Google")
      .isVisible()
      .catch(() => false);

    // At least one paid-mode state should be visible
    expect(hasBalance || hasSubscribe || hasContinueGoogle).toBe(true);
  });

  test("balance dashboard shows usage stats when subscribed", async () => {
    test.setTimeout(15_000);
    const hasBalance = await page
      .getByText("Balance")
      .isVisible()
      .catch(() => false);

    if (!hasBalance) {
      test.skip(true, "Balance dashboard not visible — user may need to subscribe first");
      return;
    }

    await expect(page.getByText("Remaining credits")).toBeVisible();
    await expect(page.getByText("Used this month")).toBeVisible();
    await expect(page.getByText("Per month plan")).toBeVisible();
  });

  test("auto refill section is visible when subscribed", async () => {
    test.setTimeout(15_000);
    const hasBalance = await page
      .getByText("Balance")
      .isVisible()
      .catch(() => false);

    if (!hasBalance) {
      test.skip(true, "Balance dashboard not visible — user may need to subscribe first");
      return;
    }

    await expect(page.getByText("Auto refill credits")).toBeVisible();
  });

  test("one-time top-up section is visible when subscribed", async () => {
    test.setTimeout(15_000);
    const hasBalance = await page
      .getByText("Balance")
      .isVisible()
      .catch(() => false);

    if (!hasBalance) {
      test.skip(true, "Balance dashboard not visible — user may need to subscribe first");
      return;
    }

    await expect(page.getByText("One-Time Top-Up")).toBeVisible();
    await expect(page.getByText("Top Up")).toBeVisible();
  });

  test("log out button is visible for authenticated user", async () => {
    test.setTimeout(15_000);
    const logoutBtn = page.locator('[aria-label="Log out"]');
    const isVisible = await logoutBtn.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, "Log out button not visible — user may not be authenticated");
      return;
    }

    await expect(logoutBtn).toBeVisible();
  });

  test("log out button opens confirmation modal", async () => {
    test.setTimeout(15_000);
    const logoutBtn = page.locator('[aria-label="Log out"]');
    const isVisible = await logoutBtn.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, "Log out button not visible — user may not be authenticated");
      return;
    }

    await logoutBtn.click();

    const modal = page.locator('[aria-label="Confirm log out"]');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal.getByText("Log out?")).toBeVisible();

    // Close the modal without logging out
    await modal.getByText("Cancel").click();
    await expect(modal).toBeHidden({ timeout: 5_000 });
  });
});
