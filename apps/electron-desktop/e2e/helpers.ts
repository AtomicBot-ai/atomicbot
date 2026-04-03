import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const ELECTRON_APP_DIR = path.resolve(__dirname, "..");
const MAIN_ENTRY = path.join(ELECTRON_APP_DIR, "dist", "main.js");

export type AppContext = {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
};

export async function launchApp(): Promise<AppContext> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "atomicbot-e2e-"));

  const app = await electron.launch({
    args: [MAIN_ENTRY],
    cwd: ELECTRON_APP_DIR,
    env: {
      ...process.env,
      NODE_ENV: "test",
      ELECTRON_RUN_AS_NODE: "",
      ATOMICBOT_E2E_USER_DATA: userDataDir,
    },
  });

  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");

  return { app, page, userDataDir };
}

export async function closeApp(ctx: AppContext): Promise<void> {
  if (ctx.app) {
    await ctx.app.close();
  }
  try {
    fs.rmSync(ctx.userDataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
}

// ---- Navigation helpers ----

export async function waitForConsentScreen(page: Page): Promise<void> {
  const el = page.locator('[role="dialog"][aria-label="User agreement"]');
  await el.waitFor({ state: "visible", timeout: 60_000 });
}

/**
 * Click "Create a new AI agent" on the consent screen without proceeding further.
 * Useful for tests that need to interact with the setup-mode page directly.
 */
export async function acceptConsentOnly(page: Page): Promise<void> {
  await waitForConsentScreen(page);
  await page.getByText("Create a new AI agent").click();
}

export async function waitForSetupModePage(page: Page): Promise<void> {
  const setupMode = page.locator('[aria-label="Setup mode selection"]');
  const retryBtn = page.getByRole("button", { name: "Retry" });

  // ensureExtendedConfig may trigger a gateway restart (auth/gateway config patch),
  // causing a transient "Setup failed" screen. Poll and click Retry when it appears.
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await setupMode.isVisible()) {
      return;
    }
    if (await retryBtn.isVisible()) {
      await retryBtn.click();
      await page.waitForTimeout(5_000);
      continue;
    }
    await page.waitForTimeout(500);
  }
  await setupMode.waitFor({ state: "visible", timeout: 10_000 });
}

export async function selectSelfManaged(page: Page): Promise<void> {
  await waitForSetupModePage(page);
  await page
    .locator('[aria-label="Setup mode selection"]')
    .getByRole("button", { name: "Connect API keys", exact: true })
    .click();
}

export async function selectPaid(page: Page): Promise<void> {
  await waitForSetupModePage(page);
  await page
    .locator('[aria-label="Setup mode selection"]')
    .getByRole("button", { name: "Continue with Google", exact: true })
    .click();
}

/**
 * Accept consent and select self-managed mode (the default path for existing tests).
 * Navigates: consent -> setup-mode -> self-managed -> provider-select.
 */
export async function acceptConsent(page: Page): Promise<void> {
  await acceptConsentOnly(page);
  await selectSelfManaged(page);
}

export async function waitForProviderSelect(page: Page): Promise<void> {
  const el = page.locator('[aria-label="Provider selection"]');
  await el.waitFor({ state: "visible", timeout: 30_000 });
}

export async function selectProvider(page: Page, providerId: string): Promise<void> {
  await waitForProviderSelect(page);
  const radio = page.locator(`input[name="provider"][value="${providerId}"]`);
  await radio.scrollIntoViewIfNeeded();
  await radio.check({ force: true });
  await page
    .locator('[aria-label="Provider selection"]')
    .getByRole("button", { name: "Continue" })
    .click();
}

export async function waitForApiKeyPage(page: Page): Promise<void> {
  const el = page.locator('[aria-label="API key setup"]');
  await el.waitFor({ state: "visible", timeout: 15_000 });
}

export async function enterApiKey(page: Page, apiKey: string): Promise<void> {
  await waitForApiKeyPage(page);
  const container = page.locator('[aria-label="API key setup"]');
  const input = container.locator("input").first();
  await input.click();
  await input.fill(apiKey);
  await page.waitForTimeout(500);

  const btn = container.getByRole("button", { name: "Continue" });
  const modelSelect = page.locator('[aria-label="Model selection"]');

  // patchAuthProfile changes auth.* which triggers a gateway restart.
  // The in-flight loadModels RPC may hang — retry the Continue click.
  for (let attempt = 0; attempt < 3; attempt++) {
    await btn.waitFor({ state: "visible" });
    await btn.click();
    try {
      await modelSelect.waitFor({ state: "visible", timeout: 20_000 });
      return;
    } catch {
      // Gateway restart likely interrupted the RPC; wait for reconnect and retry.
      await page.waitForTimeout(3_000);
      const stillOnApiKey = await container.isVisible();
      if (!stillOnApiKey) {
        return;
      }
    }
  }
}

export async function waitForModelSelect(page: Page): Promise<void> {
  const container = page.locator('[aria-label="Model selection"]');
  await container.waitFor({ state: "visible", timeout: 60_000 });
  await container.locator('button[aria-haspopup="listbox"]').first().waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await expect(container.getByRole("button", { name: "Continue" })).toBeEnabled({
    timeout: 30_000,
  });
}

export async function selectFirstModel(page: Page): Promise<string> {
  await waitForModelSelect(page);
  const container = page.locator('[aria-label="Model selection"]');
  const continueBtn = container.getByRole("button", { name: "Continue" });

  // config.patch may trigger a gateway restart, dropping the WebSocket mid-RPC.
  // When that happens the async handler errors out and navigation never fires.
  // Retry the click until we leave the model-select page.
  for (let attempt = 0; attempt < 3; attempt++) {
    await continueBtn.click();
    try {
      await container.waitFor({ state: "hidden", timeout: 15_000 });
      break;
    } catch {
      // Still on model-select — gateway restart likely interrupted the RPC.
      await page.waitForTimeout(3_000);
    }
  }

  const snap = await getConfig(page);
  const config = (snap.config ?? {}) as Record<string, unknown>;
  const agents = (config.agents ?? {}) as Record<string, unknown>;
  const defaults = (agents.defaults ?? {}) as Record<string, unknown>;
  const model = (defaults.model ?? {}) as Record<string, unknown>;
  return typeof model.primary === "string" ? model.primary : "";
}

export async function waitForSkillsPage(page: Page): Promise<void> {
  const el = page.locator('[aria-label="Skills setup"]');
  await el.waitFor({ state: "visible", timeout: 60_000 });
}

export async function skipSkills(page: Page): Promise<void> {
  await waitForSkillsPage(page);
  await page.locator('[aria-label="Skills setup"]').getByRole("button", { name: "Skip" }).click();
}

export async function waitForConnectionsPage(page: Page): Promise<void> {
  const el = page.locator('[aria-label="Connections setup"]');
  await el.waitFor({ state: "visible", timeout: 15_000 });
}

export async function skipConnections(page: Page): Promise<void> {
  await waitForConnectionsPage(page);
  await page
    .locator('[aria-label="Connections setup"]')
    .getByRole("button", { name: "Skip" })
    .click();
}

// ---- Deep link simulation (sends IPC event from main to renderer) ----

export type DeepLinkPayload = {
  host: string;
  pathname: string;
  params: Record<string, string>;
};

export async function simulateDeepLink(
  app: ElectronApplication,
  payload: DeepLinkPayload
): Promise<void> {
  await app.evaluate(({ BrowserWindow }, data) => {
    const wins = BrowserWindow.getAllWindows();
    for (const win of wins) {
      if (!win.isDestroyed()) {
        win.webContents.send("deep-link", data);
      }
    }
  }, payload);
}

export async function simulateAuthDeepLink(
  app: ElectronApplication,
  params: { jwt: string; email: string; userId: string; isNewUser?: boolean }
): Promise<void> {
  await simulateDeepLink(app, {
    host: "auth",
    pathname: "",
    params: {
      token: params.jwt,
      email: encodeURIComponent(params.email),
      userId: params.userId,
      isNewUser: params.isNewUser ? "true" : "false",
    },
  });
}

export async function simulateStripeSuccessDeepLink(app: ElectronApplication): Promise<void> {
  await simulateDeepLink(app, {
    host: "stripe-success",
    pathname: "",
    params: {},
  });
}

// ---- Gateway RPC via WebSocket (runs inside renderer context) ----

async function gatewayRpcOnce<T = unknown>(
  page: Page,
  method: string,
  params?: unknown
): Promise<T> {
  return page.evaluate(
    async ({ method, params }) => {
      const api = (globalThis as Record<string, unknown>).openclawDesktop as
        | {
            getGatewayInfo: () => Promise<{
              state: { kind: string; url: string; token: string } | null;
            }>;
          }
        | undefined;
      if (!api) throw new Error("Desktop API not available");

      const info = await api.getGatewayInfo();
      const state = info?.state;
      if (!state || state.kind !== "ready") {
        throw new Error(`Gateway not ready: ${state?.kind ?? "null"}`);
      }

      const u = new URL(state.url as string);
      u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = u.toString();
      const token = state.token as string;

      return new Promise<unknown>((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        const timer = setTimeout(() => {
          ws.close();
          reject(new Error("RPC timeout"));
        }, 15_000);

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              type: "req",
              id: "connect",
              method: "connect",
              params: {
                minProtocol: 1,
                maxProtocol: 9999,
                client: {
                  id: "openclaw-control-ui",
                  displayName: "E2E Test",
                  version: "0.0.0",
                  platform: "electron",
                  mode: "ui",
                },
                caps: ["tool-events"],
                role: "operator",
                scopes: [
                  "operator.admin",
                  "operator.read",
                  "operator.write",
                  "operator.approvals",
                  "operator.pairing",
                ],
                auth: { token },
              },
            })
          );
        };

        ws.onmessage = (ev) => {
          const frame = JSON.parse(String(ev.data)) as {
            type: string;
            id: string;
            ok?: boolean;
            payload?: unknown;
            error?: unknown;
          };
          if (frame.type === "res" && frame.id === "connect") {
            if (!frame.ok) {
              clearTimeout(timer);
              ws.close();
              reject(
                new Error(`Handshake failed: ${JSON.stringify(frame.error ?? frame.payload)}`)
              );
              return;
            }
            ws.send(JSON.stringify({ type: "req", id: "rpc", method, params }));
            return;
          }
          if (frame.type === "res" && frame.id === "rpc") {
            clearTimeout(timer);
            ws.close();
            if (frame.ok) {
              resolve(frame.payload);
            } else {
              reject(new Error(JSON.stringify(frame.error)));
            }
          }
        };

        ws.onerror = () => {
          clearTimeout(timer);
          reject(new Error("WebSocket error"));
        };
      });
    },
    { method, params }
  ) as Promise<T>;
}

// Gateway may restart after config patches (auth.*, gateway.*); retry with backoff.
export async function gatewayRpc<T = unknown>(
  page: Page,
  method: string,
  params?: unknown
): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await gatewayRpcOnce<T>(page, method, params);
    } catch (err) {
      if (attempt === maxAttempts) {
        throw err;
      }
      await page.waitForTimeout(2_000 * attempt);
    }
  }
  throw new Error("gatewayRpc: unreachable");
}

export type ConfigSnapshot = {
  path?: string;
  exists?: boolean;
  valid?: boolean;
  hash?: string;
  config?: Record<string, unknown>;
};

export async function getConfig(page: Page): Promise<ConfigSnapshot> {
  return gatewayRpc<ConfigSnapshot>(page, "config.get", {});
}

// ---- E2E config (JSON file + env var overrides) ----

export type E2EProviderEntry = { key: string };

export type E2ETelegramConfig = {
  botToken?: string;
  userId?: string;
};

export type E2ESkillEntry = Record<string, string>;

export type E2EPaidConfig = {
  jwt?: string;
  email?: string;
  userId?: string;
};

export type E2EConfig = {
  defaultProvider?: string;
  providers?: Record<string, E2EProviderEntry>;
  telegram?: E2ETelegramConfig;
  skills?: Record<string, E2ESkillEntry>;
  paid?: E2EPaidConfig;
};

let _configCache: E2EConfig | undefined;

function loadE2EConfig(): E2EConfig {
  if (_configCache) return _configCache;

  const configPath = path.join(__dirname, "e2e.config.json");
  let fileConfig: E2EConfig = {};
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    fileConfig = JSON.parse(raw) as E2EConfig;
  } catch {
    /* config file is optional — env vars can be used instead */
  }

  // Env var overrides: TEST_<PROVIDER>_KEY → providers.<provider>.key
  const envMapping: Array<{ env: string; provider: string }> = [
    { env: "TEST_OPENAI_KEY", provider: "openai" },
    { env: "TEST_ANTHROPIC_KEY", provider: "anthropic" },
    { env: "TEST_OPENROUTER_KEY", provider: "openrouter" },
    { env: "TEST_GOOGLE_KEY", provider: "google" },
    { env: "TEST_XAI_KEY", provider: "xai" },
    { env: "TEST_NVIDIA_KEY", provider: "nvidia" },
    { env: "TEST_MOONSHOT_KEY", provider: "moonshot" },
    { env: "TEST_ZAI_KEY", provider: "zai" },
    { env: "TEST_MINIMAX_KEY", provider: "minimax" },
    { env: "TEST_KIMI_CODING_KEY", provider: "kimi-coding" },
  ];

  for (const m of envMapping) {
    const val = process.env[m.env]?.trim();
    if (val) {
      fileConfig.providers ??= {};
      fileConfig.providers[m.provider] = { key: val };
    }
  }

  // Telegram env overrides
  if (process.env.TEST_TELEGRAM_BOT_TOKEN?.trim()) {
    fileConfig.telegram ??= {};
    fileConfig.telegram.botToken = process.env.TEST_TELEGRAM_BOT_TOKEN.trim();
  }
  if (process.env.TEST_TELEGRAM_USER_ID?.trim()) {
    fileConfig.telegram ??= {};
    fileConfig.telegram.userId = process.env.TEST_TELEGRAM_USER_ID.trim();
  }

  // Paid env overrides
  if (process.env.TEST_PAID_JWT?.trim()) {
    fileConfig.paid ??= {};
    fileConfig.paid.jwt = process.env.TEST_PAID_JWT.trim();
  }
  if (process.env.TEST_PAID_EMAIL?.trim()) {
    fileConfig.paid ??= {};
    fileConfig.paid.email = process.env.TEST_PAID_EMAIL.trim();
  }
  if (process.env.TEST_PAID_USER_ID?.trim()) {
    fileConfig.paid ??= {};
    fileConfig.paid.userId = process.env.TEST_PAID_USER_ID.trim();
  }

  _configCache = fileConfig;
  return fileConfig;
}

export function getE2EConfig(): E2EConfig {
  return loadE2EConfig();
}

// ---- Credential resolution (from config) ----

export type TestCredentials = { provider: string; key: string };

export function getTestCredentials(): TestCredentials | null {
  const cfg = loadE2EConfig();
  const providers = cfg.providers ?? {};

  // Prefer explicitly configured defaultProvider
  if (cfg.defaultProvider) {
    const entry = providers[cfg.defaultProvider];
    if (entry?.key?.trim() && !entry.key.includes("...")) {
      return { provider: cfg.defaultProvider, key: entry.key.trim() };
    }
  }

  for (const [provider, entry] of Object.entries(providers)) {
    if (entry.key?.trim() && !entry.key.includes("...")) {
      return { provider, key: entry.key.trim() };
    }
  }
  return null;
}

export function getTelegramConfig(): E2ETelegramConfig {
  return loadE2EConfig().telegram ?? {};
}

/**
 * Run the full onboarding up to and including the connections page (ready to finish or test
 * connections). Returns the selected model ID.
 */
export async function runOnboardingToConnections(
  page: Page,
  creds: TestCredentials
): Promise<{ modelId: string }> {
  await acceptConsent(page);
  await waitForProviderSelect(page);
  await selectProvider(page, creds.provider);
  await enterApiKey(page, creds.key);
  await waitForModelSelect(page);
  const modelId = await selectFirstModel(page);
  await skipSkills(page);
  await waitForConnectionsPage(page);
  return { modelId };
}

/**
 * Complete the full onboarding flow and wait for the chat page to appear.
 */
export async function finishOnboarding(
  page: Page,
  creds: TestCredentials
): Promise<{ modelId: string }> {
  const result = await runOnboardingToConnections(page, creds);
  await skipConnections(page);
  await page.waitForTimeout(700);
  await waitForChatPage(page);
  return result;
}

export async function waitForChatPage(page: Page): Promise<void> {
  await page.getByText("What can I help with?").waitFor({ state: "visible", timeout: 30_000 });
}

export async function startNewTask(page: Page): Promise<void> {
  const sidebar = page.locator('[aria-label="Chat sessions"]');
  const trigger = sidebar.getByText("New task", { exact: true }).first();
  await trigger.waitFor({ state: "visible", timeout: 15_000 });
  await trigger.click();
  await waitForChatPage(page);
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 10_000 });
}

export async function sendChatMessage(page: Page, text: string): Promise<void> {
  const textarea = page.locator("textarea").first();
  await textarea.click();
  await textarea.fill(text);
  await page.waitForTimeout(300);
  const sendBtn = page.locator('[aria-label="Send"]');
  await sendBtn.waitFor({ state: "visible" });
  await sendBtn.click();
}

export async function waitForAssistantResponse(page: Page, timeout = 120_000): Promise<string> {
  const typing = page.locator('[aria-label="typing"]').first();
  const copyButtons = page.locator('[aria-label="Copy"]');
  const initialCopyCount = await copyButtons.count();

  // Some responses render so quickly that the typing indicator never becomes visible.
  // Accept either a visible typing phase or a newly rendered assistant bubble.
  await Promise.race([
    typing.waitFor({ state: "visible", timeout }).catch(() => {}),
    expect
      .poll(async () => await copyButtons.count(), { timeout })
      .toBeGreaterThan(initialCopyCount)
      .catch(() => {}),
  ]);

  // If typing appeared, wait for it to finish. Otherwise wait for a new completed bubble.
  if (await typing.isVisible().catch(() => false)) {
    await page.locator('[aria-label="typing"]').waitFor({ state: "hidden", timeout });
  } else {
    await expect
      .poll(async () => await copyButtons.count(), { timeout })
      .toBeGreaterThan(initialCopyCount);
  }

  await page.waitForTimeout(500);

  // The last .UiChatText.UiMarkdown is the assistant's completed message
  const bubbles = page.locator(".UiChatText.UiMarkdown");
  const count = await bubbles.count();
  if (count < 2) {
    return "";
  }
  return (await bubbles.last().textContent()) ?? "";
}

export async function navigateToSettings(page: Page): Promise<void> {
  await page.locator('[aria-label="Settings"]').click();
  await page.locator('[aria-label="Settings page"]').waitFor({ state: "visible", timeout: 15_000 });
}

export async function navigateToMessengersTab(page: Page): Promise<void> {
  await navigateToSettings(page);
  const tabNav = page.locator('[aria-label="Settings sections"]');
  await tabNav.getByText("Messengers").click();
  await page.waitForTimeout(500);
}

export async function navigateToSkillsTab(page: Page): Promise<void> {
  await navigateToSettings(page);
  const tabNav = page.locator('[aria-label="Settings sections"]');
  await tabNav.getByText("Skills").click();
  await page.waitForTimeout(500);
}

export async function switchSkillsSource(
  page: Page,
  source: "clawhub" | "installed"
): Promise<void> {
  const label = source === "clawhub" ? "ClawHub" : "Installed";
  const tablist = page.locator('[role="tablist"][aria-label="Skills source"]');
  const tab = tablist.getByRole("tab", { name: label, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

export async function switchToInstalledSkills(page: Page): Promise<void> {
  await switchSkillsSource(page, "installed");
}

export async function switchToClawHubSkills(page: Page): Promise<void> {
  await switchSkillsSource(page, "clawhub");
}

// ---- IPC event simulation (main -> renderer) ----

export async function simulateUpdaterEvent(
  app: ElectronApplication,
  event: "updater-available" | "updater-download-progress" | "updater-downloaded" | "updater-error",
  data: Record<string, unknown>
): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, { event, data }) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send(event, data);
        }
      }
    },
    { event, data }
  );
}

export async function simulateGatewayState(
  app: ElectronApplication,
  state: Record<string, unknown>
): Promise<void> {
  await app.evaluate(({ BrowserWindow }, payload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("gateway-state", payload);
      }
    }
  }, state);
}

export async function getSessionsList(page: Page): Promise<unknown[]> {
  const result = await gatewayRpc<{ sessions: unknown[] }>(page, "sessions.list", {});
  return result?.sessions ?? [];
}

export function getSecondProviderCredentials(): TestCredentials | null {
  const cfg = loadE2EConfig();
  const providers = cfg.providers ?? {};
  let found = 0;
  for (const [provider, entry] of Object.entries(providers)) {
    if (entry.key?.trim() && !entry.key.includes("...")) {
      found++;
      if (found === 2) return { provider, key: entry.key.trim() };
    }
  }
  return null;
}

export async function clickBackButton(page: Page, containerAriaLabel: string): Promise<void> {
  await page
    .locator(`[aria-label="${containerAriaLabel}"]`)
    .getByRole("button", { name: "Back" })
    .click();
}

// ---- Paid flow helpers ----

export type PaidCredentials = { jwt: string; email: string; userId: string };

export function getPaidCredentials(): PaidCredentials | null {
  const cfg = loadE2EConfig();
  const p = cfg.paid;
  if (p?.jwt?.trim() && p?.email?.trim() && p?.userId?.trim()) {
    return { jwt: p.jwt.trim(), email: p.email.trim(), userId: p.userId.trim() };
  }
  return null;
}

export async function waitForSetupReviewPage(page: Page): Promise<void> {
  const el = page.locator('[aria-label="Setup review"]');
  await el.waitFor({ state: "visible", timeout: 30_000 });
}

export async function waitForSuccessPage(page: Page): Promise<void> {
  const el = page.locator('[aria-label="Setup complete"]');
  await el.waitFor({ state: "visible", timeout: 120_000 });
}

/**
 * Run the paid onboarding flow via deep-link simulation.
 * consent -> setup-mode(paid) -> simulate auth deep-link -> model -> skills -> connections.
 */
export async function runPaidOnboardingToConnections(
  ctx: AppContext,
  paid: PaidCredentials
): Promise<{ modelId: string }> {
  const { app, page } = ctx;

  await acceptConsentOnly(page);
  await selectPaid(page);

  // Simulate Google OAuth callback via deep link
  await page.waitForTimeout(500);
  await simulateAuthDeepLink(app, { jwt: paid.jwt, email: paid.email, userId: paid.userId });

  await waitForModelSelect(page);
  const modelId = await selectFirstModel(page);
  await skipSkills(page);
  await waitForConnectionsPage(page);
  return { modelId };
}

/**
 * Complete the full paid onboarding flow up to the review page.
 */
export async function runPaidOnboardingToReview(
  ctx: AppContext,
  paid: PaidCredentials
): Promise<{ modelId: string }> {
  const result = await runPaidOnboardingToConnections(ctx, paid);
  await ctx.page
    .locator('[aria-label="Connections setup"]')
    .getByRole("button", { name: /Skip|Continue/ })
    .click();
  return result;
}
