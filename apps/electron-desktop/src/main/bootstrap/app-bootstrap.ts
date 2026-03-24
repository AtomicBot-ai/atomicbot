import { app, type BrowserWindow } from "electron";
import { randomBytes } from "node:crypto";
import * as path from "node:path";

import type { AppState } from "../app-state";
import type { Platform } from "../platform";
import type { BinaryPaths } from "../types";
import { DEFAULT_PORT } from "../constants";
import { readConsentAccepted, writeConsentAccepted } from "../consent";
import { readOnboardedFromDisk, writeOnboardedToDisk } from "../onboarded";
import { runConfigMigrations } from "../gateway/config-migrations";
import { ensureGatewayConfigFile, readGatewayTokenFromConfig } from "../gateway/config";
import { createGatewayStarter } from "../gateway/lifecycle";
import { killOrphanedGateway, removeStaleGatewayLock } from "../gateway/pid-file";
import { registerIpcHandlers } from "../ipc/register";
import {
  resolveBin,
  resolveBundledNodeBin,
  resolveBundledOpenClawDir,
  resolvePreloadPath,
  resolveRendererIndex,
  resolveRepoRoot,
} from "../openclaw/paths";
import { registerTerminalIpcHandlers } from "../terminal/ipc";
import { installAgentNativeMessaging } from "../native-messaging/install";
import { createTailBuffer, pickPort } from "../util/net";
import { killUpdateSplash } from "../update-splash";
import { initAutoUpdater } from "../updater";
// sigma: heartbeat so the native host can detect the app is running
import { updateAppHeartbeat, clearAppStatus } from "../sigma/services/ipc-state";

type EnsureWindow = () => Promise<BrowserWindow | null>;
type EnsureTray = () => void;

export async function bootstrapApp(params: {
  gotTheLock: boolean;
  state: AppState;
  mainDir: string;
  platform: Platform;
  ensureWindow: EnsureWindow;
  ensureTray: EnsureTray;
  stopGatewayChild: () => Promise<void>;
}): Promise<void> {
  if (!params.gotTheLock) {
    return;
  }

  const userData = app.getPath("userData");
  const stateDir = path.join(userData, "openclaw");
  params.state.gatewayStateDir = stateDir;
  const whisperDataDir = path.join(userData, "whisper");
  const logsDir = path.join(userData, "logs");
  params.state.logsDirForUi = logsDir;

  const killedPid = killOrphanedGateway(stateDir);
  if (killedPid) {
    console.log(`[main] Cleaned up orphaned gateway process (PID ${killedPid})`);
  }
  // TODO: remove after 1-2 releases once orphan cleanup is proven reliable.
  // Skip in e2e: parallel test workers each spawn their own gateway;
  // a blanket pkill would tear down sibling instances.
  if (!process.env.OPENCLAW_E2E_BUNDLE_DIR) {
    try {
      params.platform.killAllByName("openclaw-gateway");
      console.log("[main] killed lingering openclaw-gateway processes");
    } catch {
      // No matching processes found — expected.
    }
  }

  const configPath = path.join(stateDir, "openclaw.json");
  removeStaleGatewayLock(configPath);

  const openclawDir = app.isPackaged
    ? resolveBundledOpenClawDir()
    : process.env.OPENCLAW_E2E_BUNDLE_DIR || resolveRepoRoot(params.mainDir);
  const nodeBin = app.isPackaged
    ? resolveBundledNodeBin()
    : (process.env.OPENCLAW_DESKTOP_NODE_BIN || "node").trim() || "node";
  const binOpts = { isPackaged: app.isPackaged, mainDir: params.mainDir };
  const bins: BinaryPaths = {
    gogBin: resolveBin("gog", binOpts),
    jqBin: resolveBin("jq", binOpts),
    memoBin: resolveBin("memo", binOpts),
    remindctlBin: resolveBin("remindctl", binOpts),
    obsidianCliBin: resolveBin("obsidian-cli", binOpts),
    ghBin: resolveBin("gh", binOpts),
    whisperCliBin: resolveBin("whisper-cli", binOpts),
  };

  const port = await pickPort(DEFAULT_PORT);
  const url = `http://127.0.0.1:${port}/`;
  const tokenFromConfig = readGatewayTokenFromConfig(configPath);
  let token = tokenFromConfig ?? randomBytes(24).toString("base64url");
  ensureGatewayConfigFile({ configPath, token });
  runConfigMigrations({ configPath, stateDir });

  const rendererIndex = resolveRendererIndex({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    mainDir: params.mainDir,
  });
  params.state.preloadPath = resolvePreloadPath(params.mainDir);
  params.state.rendererIndex = rendererIndex;

  await params.ensureWindow();
  params.ensureTray();

  killUpdateSplash();
  installAgentNativeMessaging();
  if (app.isPackaged) {
    initAutoUpdater(() => params.state.mainWindow);
  }

  const consentPath = path.join(stateDir, "consent.json");
  params.state.consentAccepted = readConsentAccepted(consentPath);
  params.state.onboarded = readOnboardedFromDisk();

  const stderrTail = createTailBuffer(24_000);
  const startGateway = createGatewayStarter({
    ...bins,
    state: params.state,
    platform: params.platform,
    stderrTail,
    ensureWindow: params.ensureWindow,
    port,
    logsDir,
    stateDir,
    configPath,
    getToken: () => token,
    url,
    openclawDir,
    nodeBin,
    whisperDataDir,
  });

  registerIpcHandlers({
    ...bins,
    getMainWindow: () => params.state.mainWindow,
    getGatewayState: () => params.state.gatewayState,
    getLogsDir: () => params.state.logsDirForUi,
    getConsentAccepted: () => params.state.consentAccepted,
    acceptConsent: async () => {
      params.state.consentAccepted = true;
      writeConsentAccepted(consentPath);
    },
    getOnboarded: () => params.state.onboarded,
    setOnboarded: (onboarded: boolean) => {
      params.state.onboarded = onboarded;
      writeOnboardedToDisk(onboarded);
    },
    startGateway,
    userData,
    stateDir,
    logsDir,
    openclawDir,
    whisperDataDir,
    stopGatewayChild: params.stopGatewayChild,
    getGatewayToken: () => token,
    setGatewayToken: (t: string) => {
      token = t;
    },
    // sigma: Local LLM handler params
    sigma: {
      getMainWindow: () => params.state.mainWindow,
      serverProcess: params.state.sigmaServerProcess,
      runtimeMode: params.state.sigmaRuntimeMode,
    },
  });

  registerTerminalIpcHandlers({
    ...bins,
    getMainWindow: () => params.state.mainWindow,
    stateDir,
    openclawDir,
    nodeBin,
  });

  await startGateway();

  // sigma: heartbeat so the native host detects the Electron app as running
  const heartbeatInterval = setInterval(() => {
    updateAppHeartbeat(process.pid);
  }, 3000);
  updateAppHeartbeat(process.pid);

  app.on("before-quit", () => {
    clearInterval(heartbeatInterval);
    clearAppStatus();
  });
}
