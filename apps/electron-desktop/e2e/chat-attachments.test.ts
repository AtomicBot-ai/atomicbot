import { test, expect, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type AppContext,
  launchApp,
  closeApp,
  finishOnboarding,
  getTestCredentials,
} from "./helpers";

const creds = getTestCredentials();

function createTempFile(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-attach-"));
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

test.describe("Chat — file attachments", () => {
  test.describe.configure({ mode: "serial" });

  let ctx: AppContext;
  let page: Page;
  const tempFiles: string[] = [];

  test.skip(!creds, "No API key — create e2e/e2e.config.json (see e2e.config.example.json)");

  test.beforeAll(async () => {
    ctx = await launchApp();
    page = ctx.page;
  });

  test.afterAll(async () => {
    if (ctx) await closeApp(ctx);
    for (const f of tempFiles) {
      try {
        fs.rmSync(path.dirname(f), { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
  });

  test("complete onboarding and reach chat page", async () => {
    test.setTimeout(120_000);
    await finishOnboarding(page, creds!);
  });

  test("attach file button is visible", async () => {
    await expect(page.locator('[aria-label="Attach file"]')).toBeVisible();
  });

  test("attach a file shows attachment card", async () => {
    const filePath = createTempFile("test-doc.txt", "Hello from e2e test");
    tempFiles.push(filePath);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);
    await page.waitForTimeout(500);

    // Attachment card or preview should appear
    const attachment = page.locator('[aria-label="Remove attachment"]');
    await expect(attachment.first()).toBeVisible({ timeout: 5_000 });
  });

  test("remove attachment via remove button", async () => {
    const removeBtn = page.locator('[aria-label="Remove attachment"]').first();
    await removeBtn.click();
    await page.waitForTimeout(300);

    await expect(page.locator('[aria-label="Remove attachment"]')).not.toBeVisible({
      timeout: 3_000,
    });
  });

  test("attach multiple files shows multiple cards", async () => {
    const file1 = createTempFile("file-a.txt", "Content A");
    const file2 = createTempFile("file-b.txt", "Content B");
    tempFiles.push(file1, file2);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([file1, file2]);
    await page.waitForTimeout(500);

    const attachments = page.locator('[aria-label="Remove attachment"]');
    const count = await attachments.count();
    expect(count).toBe(2);
  });

  test("send button requires text even with attachment", async () => {
    const sendBtn = page.locator('[aria-label="Send"]');
    await expect(sendBtn).toBeDisabled();

    const textarea = page.locator("textarea").first();
    await textarea.fill("test message");
    await page.waitForTimeout(300);
    await expect(sendBtn).toBeEnabled();

    await textarea.fill("");
    await page.waitForTimeout(300);
  });

  test("clear all attachments", async () => {
    const removeButtons = page.locator('[aria-label="Remove attachment"]');
    const count = await removeButtons.count();
    for (let i = count - 1; i >= 0; i--) {
      await removeButtons.nth(i).click();
      await page.waitForTimeout(200);
    }
    await expect(page.locator('[aria-label="Remove attachment"]')).not.toBeVisible({
      timeout: 3_000,
    });
  });
});
