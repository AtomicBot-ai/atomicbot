import { app, type BrowserWindow } from "electron";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import type { AppState } from "../app-state";
import type { Platform } from "../platform";
import type { BinaryPaths } from "../types";
import { DEFAULT_PORT } from "../constants";
import { readConsentAccepted, writeConsentAccepted } from "../consent";
import { readAnalyticsState, writeAnalyticsState } from "../analytics/analytics-state";
import { initPosthogMain, captureMain } from "../analytics/posthog-main";
import { runConfigMigrations } from "../gateway/config-migrations";
import { runExecApprovalsMigrations } from "../gateway/exec-approvals-migrations";
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
import { createTailBuffer, pickPort } from "../util/net";
import { killUpdateSplash } from "../update-splash";
import { readActiveModelId } from "../llamacpp/model-state";
import {
  resolveServerBinPath,
  isBackendDownloaded,
  downloadBackend,
} from "../llamacpp/backend-download";
import {
  getLlamacppModelDef,
  resolveLlamacppModelPath,
  resolveChatTemplatePath,
  type LlamacppModelId,
} from "../llamacpp/models";
import { startLlamacppServer } from "../llamacpp/server";
import { getSystemInfo, computeContextLength } from "../llamacpp/hardware";
import { runLlamacppMigrations } from "../llamacpp/migrations";
import { readOnboardedState } from "../onboarding-state";
import { readSetupMode } from "../setup-mode-state";
import { initAutoUpdater } from "../updater";

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
  const llamacppDataDir = path.join(userData, "llamacpp");
  const logsDir = path.join(userData, "logs");
  params.state.logsDirForUi = logsDir;

  const killedPid = killOrphanedGateway(stateDir);
  if (killedPid) {
    console.log(`[main] Cleaned up orphaned gateway process (PID ${killedPid})`);
  }
  // TODO: remove after 1-2 releases once orphan cleanup is proven reliable. (since v1.0.x)
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
  runExecApprovalsMigrations({ stateDir });
  const llamacppMigrationResult = runLlamacppMigrations({ stateDir, dataDir: llamacppDataDir });

  const rendererIndex = resolveRendererIndex({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    mainDir: params.mainDir,
  });
  params.state.preloadPath = resolvePreloadPath(params.mainDir);
  params.state.rendererIndex = rendererIndex;

  const consentPath = path.join(stateDir, "consent.json");
  params.state.consentAccepted = readConsentAccepted(consentPath);

  // Initialize analytics. Enable by default for any user who hasn't explicitly
  // made a choice yet (no state file, or state file without the prompted flag).
  const analyticsStatePath = path.join(stateDir, "analytics-state.json");
  const isFirstAnalyticsRun = !fs.existsSync(analyticsStatePath);
  const analyticsState = readAnalyticsState(stateDir);
  if (!analyticsState.prompted) {
    // Auto-enable for users who have never been prompted.
    analyticsState.enabled = true;
    analyticsState.prompted = true;
    analyticsState.enabledAt = analyticsState.enabledAt ?? new Date().toISOString();
    writeAnalyticsState(stateDir, analyticsState);
  }
  initPosthogMain(analyticsState.userId, analyticsState.enabled);
  captureMain("app_launched", {
    platform: process.platform,
    version: app.getVersion(),
    firstRun: isFirstAnalyticsRun,
  });

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

  // Register IPC handlers before opening the window so the renderer can call
  // them immediately on load without hitting "No handler registered" errors.
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
    startGateway,
    userData,
    stateDir,
    logsDir,
    openclawDir,
    whisperDataDir,
    llamacppDataDir,
    stopGatewayChild: params.stopGatewayChild,
    getGatewayToken: () => token,
    setGatewayToken: (t: string) => {
      token = t;
    },
  });

  registerTerminalIpcHandlers({
    ...bins,
    getMainWindow: () => params.state.mainWindow,
    stateDir,
    openclawDir,
    nodeBin,
  });

  await params.ensureWindow();
  params.ensureTray();

  killUpdateSplash();
  if (app.isPackaged) {
    initAutoUpdater(() => params.state.mainWindow);
  }

  await startGateway();

  // Auto-start llama-server if local-model mode is active, backend + model are ready.
  // We rely on dedicated state files (setup-mode, active-model, onboarding) rather than
  // the gateway config's primary model field, which can be stale after config.patch/apply
  // race conditions during mode switching.
  if (process.platform === "darwin") {
    try {
      const activeId = readActiveModelId(stateDir);
      const onboarded = readOnboardedState(stateDir);
      const setupMode = readSetupMode(stateDir);
      const backendReady = isBackendDownloaded(llamacppDataDir);
      console.log(
        `[main] llama auto-start check: onboarded=${String(onboarded)}, setupMode=${setupMode ?? "null"}, activeId=${activeId ?? "null"}, backendReady=${String(backendReady)}`
      );
      if (onboarded && setupMode === "local-model" && activeId && backendReady) {
        const model = getLlamacppModelDef(activeId as LlamacppModelId);
        const modelPath = resolveLlamacppModelPath(llamacppDataDir, model);
        const binPath = resolveServerBinPath(llamacppDataDir);
        const modelExists = fs.existsSync(modelPath);
        const binExists = fs.existsSync(binPath);
        console.log(
          `[main] llama paths: model=${modelPath} (exists=${String(modelExists)}), bin=${binPath} (exists=${String(binExists)})`
        );
        if (modelExists && binExists) {
          const sysInfo = getSystemInfo();
          const ctxLen = computeContextLength(sysInfo.totalRamGb, model);
          const chatTemplateFile = resolveChatTemplatePath(model, {
            isPackaged: app.isPackaged,
            appPath: app.getAppPath(),
          });
          console.log(
            `[main] auto-starting llama-server with model ${activeId}, context=${ctxLen}`
          );
          startLlamacppServer(binPath, modelPath, {
            contextLength: ctxLen,
            modelId: activeId,
            chatTemplateFile,
            stateDir,
          }).catch((err) => {
            console.error(`[main] llama-server auto-start failed: ${String(err)}`);
          });
        } else {
          console.warn("[main] llama auto-start skipped: missing model or binary file");
        }
      } else if (llamacppMigrationResult.backendDeleted && onboarded && setupMode === "local-model") {
        console.log("[main] backend was removed by migration, re-downloading in background");
        downloadBackend(llamacppDataDir)
          .then(({ tag }) => {
            console.log(`[main] backend re-downloaded after migration: ${tag}`);
            if (!activeId) return;
            const model = getLlamacppModelDef(activeId as LlamacppModelId);
            const modelPath = resolveLlamacppModelPath(llamacppDataDir, model);
            const binPath = resolveServerBinPath(llamacppDataDir);
            if (!fs.existsSync(modelPath) || !fs.existsSync(binPath)) {
              console.warn("[main] post-migration auto-start skipped: missing model or binary");
              return;
            }
            const sysInfo = getSystemInfo();
            const ctxLen = computeContextLength(sysInfo.totalRamGb, model);
            const chatTemplateFile = resolveChatTemplatePath(model, {
              isPackaged: app.isPackaged,
              appPath: app.getAppPath(),
            });
            console.log(`[main] auto-starting llama-server after migration re-download (model=${activeId}, context=${ctxLen})`);
            return startLlamacppServer(binPath, modelPath, {
              contextLength: ctxLen,
              modelId: activeId,
              chatTemplateFile,
              stateDir,
            });
          })
          .catch((err) => console.error(`[main] backend re-download failed: ${String(err)}`));
      } else {
        console.log("[main] llama auto-start skipped: preconditions not met");
      }
    } catch (err) {
      console.error(`[main] llama-server auto-start check failed: ${String(err)}`);
    }
  }
}
