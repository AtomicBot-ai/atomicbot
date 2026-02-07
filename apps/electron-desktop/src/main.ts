import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";
import type { ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { registerIpcHandlers } from "./main/ipc/register";
import { DEFAULT_PORT } from "./main/constants";
import { ensureGatewayConfigFile, readGatewayTokenFromConfig } from "./main/gateway/config";
import { spawnGateway } from "./main/gateway/spawn";
import { initAutoUpdater, disposeAutoUpdater } from "./main/updater";
import {
  resolveBundledGogBin,
  resolveBundledJqBin,
  resolveBundledMemoBin,
  resolveBundledObsidianCliBin,
  resolveBundledGhBin,
  resolveBundledRemindctlBin,
  resolveBundledNodeBin,
  resolveBundledOpenClawDir,
  resolveDownloadedGogBin,
  resolveDownloadedJqBin,
  resolveDownloadedMemoBin,
  resolveDownloadedObsidianCliBin,
  resolveDownloadedGhBin,
  resolveDownloadedRemindctlBin,
  resolvePreloadPath,
  resolveRendererIndex,
  resolveRepoRoot,
} from "./main/openclaw/paths";
import { createTailBuffer, pickPort, waitForPortOpen } from "./main/util/net";
import { createMainWindow } from "./main/window/mainWindow";
import type { GatewayState } from "./main/types";

const MAIN_DIR = __dirname;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

let preloadPathForWindow: string | null = null;
let rendererIndexForWindow: string | null = null;

let gateway: ChildProcess | null = null;
let logsDirForUi: string | null = null;
let gatewayState: GatewayState | null = null;
let consentAccepted = false;

async function stopGatewayChild(): Promise<void> {
  const child = gateway;
  gateway = null;
  if (!child) {
    return;
  }
  try {
    child.kill("SIGTERM");
  } catch {
    // ignore
  }
  await new Promise((r) => setTimeout(r, 1500));
  if (!child.killed) {
    try {
      child.kill("SIGKILL");
    } catch {
      // ignore
    }
  }
}

function broadcastGatewayState(win: BrowserWindow | null, state: GatewayState) {
  gatewayState = state;
  try {
    win?.webContents.send("gateway-state", state);
  } catch {
    // ignore
  }
}

function getTrayIconPath(): string {
  // In packaged apps, `__dirname` points inside `app.asar`. Prefer a real on-disk path under
  // `process.resourcesPath` for the menubar/tray icon (we stage it via `extraResources`).
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "assets", "trayTemplate.png");
  }

  // Dev: `__dirname` is `dist/`, and `assets/` is next to it.
  return path.join(MAIN_DIR, "..", "assets", "trayTemplate.png");
}

async function ensureMainWindow(): Promise<BrowserWindow | null> {
  const win = mainWindow;
  if (win && !win.isDestroyed()) {
    return win;
  }

  if (!preloadPathForWindow || !rendererIndexForWindow) {
    return null;
  }

  const nextWin = await createMainWindow({
    preloadPath: preloadPathForWindow,
    rendererIndex: rendererIndexForWindow,
  });
  mainWindow = nextWin;

  nextWin.on("closed", () => {
    if (mainWindow === nextWin) {
      mainWindow = null;
    }
  });

  if (gatewayState) {
    broadcastGatewayState(nextWin, gatewayState);
  }

  return nextWin;
}

async function showMainWindow(): Promise<void> {
  const win = await ensureMainWindow();
  if (!win) {
    return;
  }
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.focus();
}

function ensureTray(): void {
  if (tray) {
    return;
  }

  const trayImage = nativeImage.createFromPath(getTrayIconPath());
  // Avoid `nativeImage.resize()` here. Some Electron/macOS combos can crash inside the PNG stack
  // during startup. The Tray API and OS will scale as needed, and we ship correctly-sized assets.
  if (process.platform === "darwin") {
    trayImage.setTemplateImage(true);
  }

  tray = new Tray(trayImage);
  tray.setToolTip("Atomic Bot");

  const menu = Menu.buildFromTemplate([
    {
      label: "Show Atomic Bot",
      click: () => {
        void showMainWindow();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]);

  // Show the dropdown on left click (macOS menubar UX).
  tray.on("click", () => {
    tray?.popUpContextMenu(menu);
  });
  tray.on("right-click", () => {
    tray?.popUpContextMenu(menu);
  });

  // Keep the menu available for platforms that use right-click by default.
  tray.setContextMenu(menu);
}

app.on("window-all-closed", () => {
  // macOS convention: keep the app alive until the user quits explicitly.
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  void showMainWindow();
});

app.on("before-quit", async () => {
  disposeAutoUpdater();
  await stopGatewayChild();
});

void app.whenReady().then(async () => {
  const userData = app.getPath("userData");
  const stateDir = path.join(userData, "openclaw");
  const logsDir = path.join(userData, "logs");
  logsDirForUi = logsDir;

  const openclawDir = app.isPackaged ? resolveBundledOpenClawDir() : resolveRepoRoot(MAIN_DIR);
  // In dev, prefer a real Node binary. Spawning the Gateway via the Electron binary (process.execPath)
  // can create an extra bouncing Dock icon on macOS.
  const nodeBin = app.isPackaged
    ? resolveBundledNodeBin()
    : (process.env.OPENCLAW_DESKTOP_NODE_BIN || "node").trim() || "node";
  const gogBin = app.isPackaged ? resolveBundledGogBin() : resolveDownloadedGogBin(MAIN_DIR);
  const jqBin = app.isPackaged ? resolveBundledJqBin() : resolveDownloadedJqBin(MAIN_DIR);
  const memoBin = app.isPackaged ? resolveBundledMemoBin() : resolveDownloadedMemoBin(MAIN_DIR);
  const remindctlBin = app.isPackaged
    ? resolveBundledRemindctlBin()
    : resolveDownloadedRemindctlBin(MAIN_DIR);
  const obsidianCliBin = app.isPackaged
    ? resolveBundledObsidianCliBin()
    : resolveDownloadedObsidianCliBin(MAIN_DIR);
  const ghBin = app.isPackaged ? resolveBundledGhBin() : resolveDownloadedGhBin(MAIN_DIR);

  const port = await pickPort(DEFAULT_PORT);
  const url = `http://127.0.0.1:${port}/`;
  const configPath = path.join(stateDir, "openclaw.json");
  const tokenFromConfig = readGatewayTokenFromConfig(configPath);
  const token = tokenFromConfig ?? randomBytes(24).toString("base64url");
  ensureGatewayConfigFile({ configPath, token });

  const rendererIndex = resolveRendererIndex({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    mainDir: MAIN_DIR,
  });
  const preloadPath = resolvePreloadPath(MAIN_DIR);
  preloadPathForWindow = preloadPath;
  rendererIndexForWindow = rendererIndex;

  await ensureMainWindow();
  ensureTray();

  // Initialize auto-updater in packaged builds only.
  if (app.isPackaged) {
    initAutoUpdater(() => mainWindow);
  }

  // Consent is stored in the same per-user state dir as the embedded gateway config.
  const consentPath = path.join(stateDir, "consent.json");
  consentAccepted = readConsentAccepted(consentPath);

  const stderrTail = createTailBuffer(24_000);

  const startGateway = async () => {
    if (gateway) {
      return;
    }
    const nextWin = await ensureMainWindow();
    broadcastGatewayState(nextWin, { kind: "starting", port, logsDir, token });
    gateway = spawnGateway({
      port,
      logsDir,
      stateDir,
      configPath,
      token,
      openclawDir,
      nodeBin,
      gogBin,
      jqBin,
      memoBin,
      remindctlBin,
      obsidianCliBin,
      ghBin,
      electronRunAsNode: nodeBin === process.execPath,
      stderrTail,
    });

    const ok = await waitForPortOpen("127.0.0.1", port, 30_000);
    if (!ok) {
      const details = [
        `Gateway did not open the port within 30s.`,
        "",
        `openclawDir: ${openclawDir}`,
        `nodeBin: ${nodeBin}`,
        `stderr (tail):`,
        stderrTail.read().trim() || "<empty>",
        "",
        `See logs in: ${logsDir}`,
      ].join("\n");
      broadcastGatewayState(nextWin, { kind: "failed", port, logsDir, details, token });
      return;
    }

    // Keep the Electron window on the React renderer. The legacy Control UI is embedded in an iframe
    // and can be switched to/from the native pages without losing the top-level navigation.
    broadcastGatewayState(nextWin, { kind: "ready", port, logsDir, url, token });
  };

  registerIpcHandlers({
    getMainWindow: () => mainWindow,
    getGatewayState: () => gatewayState,
    getLogsDir: () => logsDirForUi,
    getConsentAccepted: () => consentAccepted,
    acceptConsent: async () => {
      consentAccepted = true;
      writeConsentAccepted(consentPath);
    },
    startGateway,
    userData,
    stateDir,
    logsDir,
    openclawDir,
    gogBin,
    memoBin,
    remindctlBin,
    obsidianCliBin,
    ghBin,
    stopGatewayChild,
  });

  // If consent has already been accepted previously, start the gateway immediately.
  if (consentAccepted) {
    await startGateway();
  }
});

function readConsentAccepted(consentPath: string): boolean {
  try {
    if (!fs.existsSync(consentPath)) {
      return false;
    }
    const raw = fs.readFileSync(consentPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return false;
    }
    const obj = parsed as { accepted?: unknown };
    return obj.accepted === true;
  } catch {
    return false;
  }
}

function writeConsentAccepted(consentPath: string): void {
  try {
    fs.mkdirSync(path.dirname(consentPath), { recursive: true });
    const payload = { accepted: true, acceptedAt: new Date().toISOString() };
    fs.writeFileSync(consentPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  } catch {
    // ignore
  }
}
