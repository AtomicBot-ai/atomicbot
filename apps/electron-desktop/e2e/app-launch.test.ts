import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import * as path from "node:path";

const ELECTRON_APP_DIR = path.resolve(__dirname, "..");
const MAIN_ENTRY = path.join(ELECTRON_APP_DIR, "dist", "main.js");

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await electron.launch({
    args: [MAIN_ENTRY],
    cwd: ELECTRON_APP_DIR,
    env: {
      ...process.env,
      NODE_ENV: "test",
      ELECTRON_RUN_AS_NODE: "",
    },
  });
  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
});

test.afterAll(async () => {
  if (app) {
    await app.close();
  }
});

test("app window opens and has a title", async () => {
  const title = await page.title();
  expect(title).toBeTruthy();
});

test("loading screen appears on launch", async () => {
  const loadingEl = page.locator('[role="status"][aria-label="Loading"]');
  const consentEl = page.locator('[role="dialog"][aria-label="User agreement"]');

  // Either loading screen is visible (gateway still starting)
  // or consent screen already appeared (gateway started fast).
  const firstVisible = await Promise.race([
    loadingEl.waitFor({ state: "visible", timeout: 15_000 }).then(() => "loading" as const),
    consentEl.waitFor({ state: "visible", timeout: 15_000 }).then(() => "consent" as const),
  ]);

  expect(["loading", "consent"]).toContain(firstVisible);
});

test("transitions to consent screen for a fresh user", async () => {
  const consentEl = page.locator('[role="dialog"][aria-label="User agreement"]');
  await consentEl.waitFor({ state: "visible", timeout: 60_000 });

  await expect(page.getByText("Welcome to Atomic Claw")).toBeVisible();
  await expect(page.getByText("Create a new AI agent")).toBeVisible();
  await expect(page.getByText("Import an existing setup")).toBeVisible();
});
