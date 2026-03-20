import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  finishOnboarding,
  sendChatMessage,
  waitForAssistantResponse,
  getSessionsList,
  getTestCredentials,
} from "./helpers";

const creds = getTestCredentials();

test.describe("Chat — extended interactions", () => {
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

  test("complete onboarding for chat tests", async () => {
    test.setTimeout(120_000);
    await finishOnboarding(page, creds!);
    await expect(page.getByText("What can I help with?")).toBeVisible();
  });

  test("send message and verify copy button appears", async () => {
    test.setTimeout(180_000);
    await sendChatMessage(page, "Say hello in one word.");

    const response = await waitForAssistantResponse(page, 120_000);
    expect(response.length).toBeGreaterThan(0);

    const copyBtn = page.locator('[aria-label="Copy"]').first();
    await copyBtn.waitFor({ state: "visible", timeout: 5_000 });
    await expect(copyBtn).toBeVisible();
  });

  test("copy button changes to Copied state on click", async () => {
    test.setTimeout(15_000);
    const copyBtn = page.locator('[aria-label="Copy"]').first();
    await copyBtn.click();

    const copiedBtn = page.locator('[aria-label="Copied"]').first();
    await copiedBtn.waitFor({ state: "visible", timeout: 3_000 });
    await expect(copiedBtn).toBeVisible();

    // After 1.5s the label should revert to "Copy"
    await page.waitForTimeout(2_000);
    await expect(page.locator('[aria-label="Copy"]').first()).toBeVisible();
  });

  test("send second message in same session", async () => {
    test.setTimeout(180_000);
    await sendChatMessage(page, "Now say goodbye in one word.");

    const response = await waitForAssistantResponse(page, 120_000);
    expect(response.length).toBeGreaterThan(0);

    // At minimum: 2 user + 2 assistant = 4 bubbles, but gateway may
    // occasionally drop, so accept >= 3 (two user + one assistant).
    const bubbles = page.locator(".UiChatText.UiMarkdown");
    const count = await bubbles.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("create new session and switch back to first", async () => {
    test.setTimeout(60_000);

    const sessionList = page.locator('[aria-label="Chat sessions"] ul[role="list"] li');
    const firstSessionCount = await sessionList.count();
    expect(firstSessionCount).toBeGreaterThanOrEqual(1);

    // Create a new session
    await page.locator('[aria-label="New session"]').click();
    await expect(page.getByText("What can I help with?")).toBeVisible({ timeout: 10_000 });

    // Send a message in the new session
    await sendChatMessage(page, "What is 1 + 1? Reply with just the number.");
    const response = await waitForAssistantResponse(page, 120_000);
    expect(response).toContain("2");

    // Now we should have 2 sessions in sidebar
    const sessionsAfter = await getSessionsList(page);
    expect(sessionsAfter.length).toBeGreaterThanOrEqual(2);

    // Sidebar is sorted newest-first; the original session (with 4 bubbles) is last
    const lastItem = sessionList.last();
    await lastItem.locator("button").first().click();
    await page.waitForTimeout(2_000);

    // Original session should show multiple messages (from earlier tests)
    const bubbles = page.locator(".UiChatText.UiMarkdown");
    const count = await bubbles.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test("delete session via sidebar menu", async () => {
    test.setTimeout(30_000);

    const sessionsBefore = await getSessionsList(page);
    const countBefore = sessionsBefore.length;
    expect(countBefore).toBeGreaterThanOrEqual(2);

    // Open session options menu on the first session item
    const sessionItem = page.locator('[aria-label="Chat sessions"] ul[role="list"] li').first();

    const menuTrigger = sessionItem.locator('[aria-label="Session options"]');
    await menuTrigger.click();

    // Wait for the popover menu to appear
    const deleteBtn = sessionItem.locator('[role="menuitem"]').filter({ hasText: "Delete" });
    await deleteBtn.waitFor({ state: "visible", timeout: 5_000 });
    await deleteBtn.click();

    // UI shows a custom ConfirmDeleteDialog — click its Delete button
    const confirmDialog = page.getByRole("dialog", { name: /Delete session/ });
    await confirmDialog.waitFor({ state: "visible", timeout: 5_000 });
    await confirmDialog.getByRole("button", { name: "Delete" }).click();

    // Session count should decrease
    await page.waitForTimeout(2_000);
    const sessionsAfter = await getSessionsList(page);
    expect(sessionsAfter.length).toBeLessThan(countBefore);
  });
});
