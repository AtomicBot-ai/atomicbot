import { test, expect, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type AppContext,
  launchApp,
  closeApp,
  finishOnboarding,
  navigateToSettings,
  gatewayRpc,
  getConfig,
  sendChatMessage,
  waitForAssistantResponse,
  getTestCredentials,
} from "./helpers";

const creds = getTestCredentials();

function getObj(val: unknown): Record<string, unknown> {
  return val && typeof val === "object" && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

test.describe("Backup roundtrip (create -> mutate -> restore -> verify)", () => {
  test.describe.configure({ mode: "serial" });

  let ctx: AppContext;
  let page: Page;
  let tempBackupDir: string;
  let zipPath: string;

  let originalProfiles: Record<string, unknown>;
  let originalModelPrimary: unknown;

  test.skip(!creds, "No API key — create e2e/e2e.config.json (see e2e.config.example.json)");

  test.beforeAll(async () => {
    ctx = await launchApp();
    page = ctx.page;
    tempBackupDir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-backup-"));
  });

  test.afterAll(async () => {
    if (ctx) await closeApp(ctx);
    try {
      fs.rmSync(tempBackupDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  });

  test("complete onboarding", async () => {
    test.setTimeout(120_000);
    await finishOnboarding(page, creds!);
  });

  // ── Snapshot original config ──────────────────────────────

  test("snapshot original config (provider, key, model)", async () => {
    test.setTimeout(15_000);
    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const auth = getObj(cfg.auth);
    originalProfiles = getObj(auth.profiles);
    expect(Object.keys(originalProfiles).length).toBeGreaterThanOrEqual(1);

    const agents = getObj(cfg.agents);
    const defaults = getObj(agents.defaults);
    const model = getObj(defaults.model);
    originalModelPrimary = model.primary;
    expect(originalModelPrimary).toBeTruthy();
  });

  // ── Create backup (copy stateDir + ZIP) ───────────────────

  test("copy stateDir and create ZIP backup", async () => {
    test.setTimeout(15_000);
    const openclawDir = path.join(ctx.userDataDir, "openclaw");
    const copyDest = path.join(tempBackupDir, "openclaw");
    fs.cpSync(openclawDir, copyDest, { recursive: true });

    // Verify the copy contains openclaw.json
    expect(fs.existsSync(path.join(copyDest, "openclaw.json"))).toBe(true);

    zipPath = path.join(tempBackupDir, "backup.zip");
    execSync(`zip -r "${zipPath}" .`, { cwd: copyDest, stdio: "ignore" });
    expect(fs.existsSync(zipPath)).toBe(true);
    expect(fs.statSync(zipPath).size).toBeGreaterThan(100);
  });

  // ── Mutate config (add identifiable marker) ───────────────

  test("mutate config with identifiable marker", async () => {
    test.setTimeout(15_000);
    const snap = await getConfig(page);
    await gatewayRpc(page, "config.patch", {
      baseHash: snap.hash,
      raw: JSON.stringify({
        agents: { defaults: { imageMaxDimensionPx: 999 } },
      }),
    });

    // Verify mutation persisted
    const after = await getConfig(page);
    const cfg = getObj(after.config);
    const agents = getObj(cfg.agents);
    const defaults = getObj(agents.defaults);
    expect(defaults.imageMaxDimensionPx).toBe(999);
  });

  // ── Restore via Settings modal ────────────────────────────

  test("open restore modal and upload backup ZIP", async () => {
    test.setTimeout(60_000);
    await navigateToSettings(page);

    const tabNav = page.locator('[aria-label="Settings sections"]');
    await tabNav.getByText("Other").click();
    await page.waitForTimeout(1_000);

    // Open restore modal
    await page.locator("section").filter({ hasText: "Backup" }).getByText("Choose file").click();

    const modal = page.locator('[aria-label="Restore from backup"]');
    await modal.waitFor({ state: "visible", timeout: 5_000 });

    // Upload the ZIP via hidden file input
    const fileInput = modal.locator('input[type="file"]');
    await fileInput.setInputFiles(zipPath);

    // Wait for restore: the modal closes and app navigates to chat.
    // The restore process stops gateway, swaps stateDir, restarts gateway.
    // This can take a while.
    await page.getByText("What can I help with?").waitFor({ state: "visible", timeout: 60_000 });
  });

  // ── Verify config reverted ────────────────────────────────

  test("config marker is gone after restore", async () => {
    test.setTimeout(30_000);
    // Gateway needs time to fully restart after restore
    await page.waitForTimeout(5_000);

    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const agents = getObj(cfg.agents);
    const defaults = getObj(agents.defaults);

    // The marker (999) should be absent -- reverted to original
    expect(defaults.imageMaxDimensionPx).not.toBe(999);
  });

  test("provider key preserved after restore", async () => {
    test.setTimeout(15_000);
    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const auth = getObj(cfg.auth);
    const profiles = getObj(auth.profiles);

    // Same number of provider profiles as before
    expect(Object.keys(profiles).length).toBe(Object.keys(originalProfiles).length);
  });

  test("model preserved after restore", async () => {
    test.setTimeout(15_000);
    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const agents = getObj(cfg.agents);
    const defaults = getObj(agents.defaults);
    const model = getObj(defaults.model);
    expect(model.primary).toBe(originalModelPrimary);
  });

  // ── Verify settings UI shows correct state ────────────────

  test("settings shows provider as configured after restore", async () => {
    test.setTimeout(30_000);
    await navigateToSettings(page);

    const tabNav = page.locator('[aria-label="Settings sections"]');
    await tabNav.getByText("AI Models").click();
    await page.waitForTimeout(1_000);

    // In the combined tab, a configured provider shows "API key configured" or "Connected" badge
    const configuredBadge = page.getByText(/API key configured|Connected/);
    await expect(configuredBadge.first()).toBeVisible({ timeout: 10_000 });
  });

  test("settings shows correct model selected after restore", async () => {
    test.setTimeout(30_000);

    // Model dropdown trigger shows the selected model label
    const modelTrigger = page.locator('button[aria-haspopup="listbox"]').last();
    await expect(modelTrigger).toBeVisible({ timeout: 10_000 });

    // Verify the trigger does not show the placeholder text
    const triggerText = await modelTrigger.innerText();
    expect(triggerText).toBeTruthy();
    expect(triggerText).not.toContain("Select model");
  });

  // ── Verify chat works after restore ───────────────────────

  test("chat works after restore (gateway functional)", async () => {
    test.setTimeout(180_000);
    await page.locator('[aria-label="New session"]').click();
    await page.waitForTimeout(1_000);

    await sendChatMessage(page, "Say OK if you can hear me.");
    const response = await waitForAssistantResponse(page, 120_000);
    expect(response.length).toBeGreaterThan(0);
  });
});
