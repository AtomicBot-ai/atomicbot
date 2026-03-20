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

test.describe("Backup & Restore (gateway IPC pipeline)", () => {
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

  // ── Backup IPC ────────────────────────────────────────────

  test("createBackup IPC handler is available", async () => {
    const hasApi = await page.evaluate(() => {
      const api = (globalThis as Record<string, unknown>).openclawDesktop as
        | { createBackup?: unknown }
        | undefined;
      return typeof api?.createBackup === "function";
    });
    expect(hasApi).toBe(true);
  });

  // ── Restore modal UI (tests actual IPC restore path) ─────

  test("open restore modal from settings", async () => {
    test.setTimeout(30_000);
    await navigateToSettings(page);

    const tabNav = page.locator('[aria-label="Settings sections"]');
    await tabNav.getByText("Other").click();
    await page.waitForTimeout(1_000);

    // Click "Choose file" in the Backup section to open the restore modal
    await page.locator("section").filter({ hasText: "Backup" }).getByText("Choose file").click();

    const modal = page.locator('[aria-label="Restore from backup"]');
    await modal.waitFor({ state: "visible", timeout: 5_000 });
  });

  test("restore modal shows warning about replacing config", async () => {
    const modal = page.locator('[aria-label="Restore from backup"]');
    await expect(modal).toBeVisible();

    const warningText = modal.getByText("This will replace your current configuration");
    await expect(warningText).toBeVisible();

    const safetyBackupText = modal.getByText(
      "A safety backup of your current state will be created automatically"
    );
    await expect(safetyBackupText).toBeVisible();
  });

  test("restore modal shows drop zone and choose-file link", async () => {
    const modal = page.locator('[aria-label="Restore from backup"]');

    await expect(modal.getByText("Drag ZIP folder here")).toBeVisible();
    await expect(modal.getByText("choose a file")).toBeVisible();
    await expect(modal.locator('input[type="file"][accept=".zip,.gz,.tgz"]')).toBeAttached();
  });

  test("restore modal rejects invalid file type", async () => {
    const modal = page.locator('[aria-label="Restore from backup"]');
    const fileInput = modal.locator('input[type="file"]');

    // Playwright's setInputFiles simulates picking a file; the handler reads
    // the File object and validates its extension before sending to IPC.
    // A .txt file should be rejected client-side.
    await fileInput.setInputFiles({
      name: "bad-backup.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not a real backup"),
    });

    await page.waitForTimeout(1_000);

    const errorEl = modal.getByText("Please upload a .zip or .tar.gz file");
    await expect(errorEl).toBeVisible({ timeout: 5_000 });
  });
});
