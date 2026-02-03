import { app, ipcMain, shell, type BrowserWindow } from "electron";

import { upsertApiKeyProfile } from "../keys/apiKeys";
import { registerGogIpcHandlers } from "../gog/ipc";
import { registerResetAndCloseIpcHandler } from "../reset/ipc";
import type { GatewayState } from "../types";

export function registerIpcHandlers(params: {
  getMainWindow: () => BrowserWindow | null;
  getGatewayState: () => GatewayState | null;
  getLogsDir: () => string | null;
  userData: string;
  stateDir: string;
  logsDir: string;
  openclawDir: string;
  gogBin: string;
  stopGatewayChild: () => Promise<void>;
}) {
  ipcMain.handle("open-logs", async () => {
    const logsDir = params.getLogsDir();
    if (!logsDir) {
      return;
    }
    // Open the logs directory in Finder/Explorer.
    await shell.openPath(logsDir);
  });

  ipcMain.handle("devtools-toggle", async () => {
    const win = params.getMainWindow();
    if (!win || win.isDestroyed()) {
      return;
    }
    const wc = win.webContents;
    if (wc.isDevToolsOpened()) {
      wc.closeDevTools();
    } else {
      wc.openDevTools({ mode: "detach" });
    }
  });

  ipcMain.handle("open-external", async (_evt, p: { url?: unknown }) => {
    const url = typeof p?.url === "string" ? p.url : "";
    if (!url) {
      return;
    }
    await shell.openExternal(url);
  });

  ipcMain.handle("gateway-get-info", async () => ({ state: params.getGatewayState() }));

  ipcMain.handle("gateway-retry", async () => {
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle("auth-set-anthropic-api-key", async (_evt, p: { apiKey?: unknown }) => {
    const apiKey = typeof p?.apiKey === "string" ? p.apiKey : "";
    upsertApiKeyProfile({ stateDir: params.stateDir, provider: "anthropic", key: apiKey, profileName: "default" });
    return { ok: true } as const;
  });

  registerGogIpcHandlers({ gogBin: params.gogBin, openclawDir: params.openclawDir, userData: params.userData });
  registerResetAndCloseIpcHandler({
    userData: params.userData,
    stateDir: params.stateDir,
    logsDir: params.logsDir,
    gogBin: params.gogBin,
    openclawDir: params.openclawDir,
    stopGatewayChild: params.stopGatewayChild,
  });
}

