import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  acceptConsent,
  waitForProviderSelect,
  selectProvider,
  enterApiKey,
  waitForModelSelect,
  selectFirstModel,
  waitForSkillsPage,
  skipSkills,
  skipConnections,
  waitForConnectionsPage,
  getConfig,
  getTestCredentials,
} from "./helpers";

const creds = getTestCredentials();

function getObj(val: unknown): Record<string, unknown> {
  return val && typeof val === "object" && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

test.describe("Config verification during onboarding", () => {
  test.describe.configure({ mode: "serial" });

  let ctx: AppContext;
  let page: Page;
  let hashAfterAutoStart: string | undefined;
  let hashAfterApiKey: string | undefined;

  test.skip(!creds, "No API key — create e2e/e2e.config.json (see e2e.config.example.json)");

  test.beforeAll(async () => {
    ctx = await launchApp();
    page = ctx.page;
  });

  test.afterAll(async () => {
    if (ctx) await closeApp(ctx);
  });

  test("config after auto-start has gateway defaults and hooks", async () => {
    test.setTimeout(90_000);
    await acceptConsent(page);
    await waitForProviderSelect(page);

    const snap = await getConfig(page);
    expect(snap.exists).toBe(true);
    expect(snap.valid).toBe(true);
    expect(snap.hash).toBeTruthy();
    hashAfterAutoStart = snap.hash;

    const cfg = getObj(snap.config);
    const gateway = getObj(cfg.gateway);
    expect(gateway.mode).toBe("local");
    expect(gateway.bind).toBe("loopback");

    const hooks = getObj(cfg.hooks);
    const internal = getObj(hooks.internal);
    expect(internal.enabled).toBe(true);
    const entries = getObj(internal.entries);
    expect(getObj(entries["session-memory"]).enabled).toBe(true);
    expect(getObj(entries["command-logger"]).enabled).toBe(true);

    const agents = getObj(cfg.agents);
    const defaults = getObj(agents.defaults);
    expect(defaults.workspace).toBeTruthy();
  });

  test("config.patch changes hash after API key is saved (optimistic concurrency)", async () => {
    test.setTimeout(90_000);
    await selectProvider(page, creds!.provider);
    await enterApiKey(page, creds!.key);
    await waitForModelSelect(page);

    const snap = await getConfig(page);
    hashAfterApiKey = snap.hash;
    expect(hashAfterApiKey).toBeTruthy();
    expect(hashAfterApiKey).not.toBe(hashAfterAutoStart);

    const cfg = getObj(snap.config);
    const auth = getObj(cfg.auth);
    const profiles = getObj(auth.profiles);
    const profileKey = `${creds!.provider}:default`;
    const profile = getObj(profiles[profileKey]);
    expect(profile.provider).toBe(creds!.provider);
    expect(profile.mode).toBe("api_key");

    const order = getObj(auth.order);
    const providerOrder = order[creds!.provider];
    expect(Array.isArray(providerOrder)).toBe(true);
    expect(providerOrder).toContain(profileKey);
  });

  test("config has default model after model selection", async () => {
    const modelId = await selectFirstModel(page);
    expect(modelId).toBeTruthy();

    // Wait for navigation to skills page (confirms config.patch completed)
    await waitForSkillsPage(page);

    const snap = await getConfig(page);
    expect(snap.hash).not.toBe(hashAfterApiKey);

    const cfg = getObj(snap.config);
    const agents = getObj(cfg.agents);
    const defaults = getObj(agents.defaults);
    const model = getObj(defaults.model);
    expect(model.primary).toBe(modelId);
  });

  test("full config is consistent after completing onboarding", async () => {
    await skipSkills(page);
    await waitForConnectionsPage(page);
    await skipConnections(page);

    const onboarded = await page.evaluate(() =>
      localStorage.getItem("openclaw.desktop.onboarded.v1")
    );
    expect(onboarded).toBe("1");

    const snap = await getConfig(page);
    const cfg = getObj(snap.config);

    const gateway = getObj(cfg.gateway);
    expect(gateway.mode).toBe("local");
    expect(gateway.bind).toBe("loopback");
    expect(typeof gateway.port).toBe("number");
    const gatewayAuth = getObj(gateway.auth);
    expect(gatewayAuth.mode).toBe("token");
    expect(gatewayAuth.token).toBeTruthy();

    const auth = getObj(cfg.auth);
    const profiles = getObj(auth.profiles);
    expect(Object.keys(profiles).length).toBeGreaterThan(0);

    const agents = getObj(cfg.agents);
    const defaults = getObj(agents.defaults);
    expect(defaults.workspace).toBeTruthy();
    const model = getObj(defaults.model);
    expect(model.primary).toBeTruthy();
  });
});
