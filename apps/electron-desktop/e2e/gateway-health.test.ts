import { test, expect, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  type AppContext,
  launchApp,
  closeApp,
  finishOnboarding,
  gatewayRpc,
  getConfig,
  getTestCredentials,
} from "./helpers";

const creds = getTestCredentials();

test.describe("Gateway health (process & IPC verification)", () => {
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

  // ── Gateway state ─────────────────────────────────────────

  test("gateway state is ready after onboarding", async () => {
    test.setTimeout(15_000);
    const info = await page.evaluate(async () => {
      const api = (globalThis as Record<string, unknown>).openclawDesktop as
        | { getGatewayInfo: () => Promise<{ state: { kind: string } | null }> }
        | undefined;
      if (!api?.getGatewayInfo) throw new Error("Desktop API not available");
      return api.getGatewayInfo();
    });

    expect(info.state).toBeTruthy();
    expect(info.state!.kind).toBe("ready");
  });

  // ── Gateway RPC connectivity ──────────────────────────────

  test("gateway WebSocket accepts RPC connections", async () => {
    test.setTimeout(15_000);
    const snap = await getConfig(page);
    expect(snap.hash).toBeTruthy();
    expect(snap.config).toBeTruthy();
  });

  test("gateway health RPC succeeds", async () => {
    test.setTimeout(15_000);
    const result = await gatewayRpc<Record<string, unknown>>(page, "health", {});
    expect(result).toBeTruthy();
  });

  // ── PID file ──────────────────────────────────────────────

  test("gateway PID file exists and contains numeric PID", async () => {
    test.setTimeout(10_000);

    const openclawDir = path.join(ctx.userDataDir, "openclaw");
    const pidPath = path.join(openclawDir, "gateway.pid");

    // The PID file is written by the main process when spawning the gateway
    const pidFileExists = fs.existsSync(pidPath);
    expect(pidFileExists).toBe(true);

    const pidRaw = fs.readFileSync(pidPath, "utf-8").trim();
    const pid = Number(pidRaw);
    expect(Number.isFinite(pid)).toBe(true);
    expect(pid).toBeGreaterThan(0);
  });

  test("process with gateway PID is alive", async () => {
    test.setTimeout(10_000);

    const pidPath = path.join(ctx.userDataDir, "openclaw", "gateway.pid");
    const pid = Number(fs.readFileSync(pidPath, "utf-8").trim());

    // signal 0 = existence check, no actual signal sent
    let isAlive = false;
    try {
      process.kill(pid, 0);
      isAlive = true;
    } catch {
      isAlive = false;
    }

    expect(isAlive).toBe(true);
  });
});
