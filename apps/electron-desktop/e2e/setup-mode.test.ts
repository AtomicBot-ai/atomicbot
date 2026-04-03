import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  acceptConsentOnly,
  waitForSetupModePage,
  selectSelfManaged,
  waitForProviderSelect,
} from "./helpers";

test.describe("Setup mode selection page", () => {
  test.describe.configure({ mode: "serial" });

  let ctx: AppContext;
  let page: Page;

  test.beforeAll(async () => {
    ctx = await launchApp();
    page = ctx.page;
  });

  test.afterAll(async () => {
    if (ctx) await closeApp(ctx);
  });

  test("setup mode page appears after consent", async () => {
    test.setTimeout(90_000);
    await acceptConsentOnly(page);
    await waitForSetupModePage(page);

    await expect(page.getByText("Choose how to run your AI agent")).toBeVisible();
  });

  test("shows paid option with Popular badge and Google button", async () => {
    const container = page.locator('[aria-label="Setup mode selection"]');

    await expect(container.getByText("Ready to go")).toBeVisible();
    await expect(container.getByText("Starts with a free trial")).toBeVisible();
    await expect(container.getByText("Popular 🔥")).toBeVisible();
    await expect(
      container.getByRole("button", { name: "Continue with Google", exact: true })
    ).toBeVisible();
  });

  test("shows self-managed option with API key button", async () => {
    const container = page.locator('[aria-label="Setup mode selection"]');

    await expect(container.getByText("Bring your own API keys")).toBeVisible();
    await expect(container.getByText("Pay providers directly")).toBeVisible();
    await expect(
      container.getByRole("button", { name: "Connect API keys", exact: true })
    ).toBeVisible();
  });

  test("selecting self-managed navigates to provider select", async () => {
    test.setTimeout(30_000);
    await selectSelfManaged(page);
    await waitForProviderSelect(page);

    await expect(page.getByText("Choose AI Provider")).toBeVisible();
  });

  test("back from provider select returns to setup mode", async () => {
    test.setTimeout(30_000);
    const container = page.locator('[aria-label="Provider selection"]');
    await container.getByRole("button", { name: "Back" }).click();

    await waitForSetupModePage(page);
    await expect(page.getByText("Choose how to run your AI agent")).toBeVisible();
  });
});
