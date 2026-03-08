import { test, expect } from "@playwright/test";
import { type AppContext, launchApp, closeApp, simulateGatewayState } from "./helpers";

test.describe("Error screen (gateway failure)", () => {
  let ctx: AppContext;

  test.beforeAll(async () => {
    ctx = await launchApp();
  });

  test.afterAll(async () => {
    if (ctx) await closeApp(ctx);
  });

  test("simulate gateway failed and verify error page", async () => {
    test.setTimeout(60_000);
    const { app, page } = ctx;

    // Wait for gateway to fully initialize (consent screen confirms "ready" state
    // has been received and Redux is set up) before simulating failure.
    await page.locator('[role="dialog"][aria-label="User agreement"]').waitFor({
      state: "visible",
      timeout: 60_000,
    });

    const sendFailed = async () => {
      await simulateGatewayState(app, {
        kind: "failed",
        port: 18789,
        logsDir: "/tmp/e2e-test-logs",
        details: "E2E simulated failure",
      });
    };

    for (let i = 0; i < 10; i++) {
      await sendFailed();
      await page.waitForTimeout(300);
      if (
        await page
          .getByText("OpenClaw Gateway failed to start")
          .isVisible()
          .catch(() => false)
      ) {
        break;
      }
    }

    await expect(page.getByText("OpenClaw Gateway failed to start")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("error page shows port info", async () => {
    await expect(ctx.page.getByText("port: 18789")).toBeVisible();
  });

  test("error page shows logs directory", async () => {
    await expect(ctx.page.getByText("logs: /tmp/e2e-test-logs")).toBeVisible();
  });

  test("error page shows failure details", async () => {
    await expect(ctx.page.getByText("E2E simulated failure")).toBeVisible();
  });
});
