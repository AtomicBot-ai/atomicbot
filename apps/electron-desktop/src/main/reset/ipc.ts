import { app, ipcMain, session } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";

import { IPC } from "../../shared/ipc-channels";
import { clearGogAuthTokens } from "../gog/gog";
import type { ResetHandlerParams } from "../ipc/types";
import type { ResetAndCloseResult } from "../types";

export function registerResetAndCloseIpcHandler(params: ResetHandlerParams) {
  const { userData, stateDir, logsDir, whisperDataDir, gogBin, openclawDir, stopGatewayChild } =
    params;

  ipcMain.handle(IPC.resetAndClose, async () => {
    const warnings: string[] = [];

    try {
      await stopGatewayChild();
    } catch (err) {
      warnings.push(`failed to stop gateway: ${String(err)}`);
    }

    try {
      await clearGogAuthTokens({ gogBin, openclawDir, stateDir, warnings });
    } catch (err) {
      warnings.push(`failed to clear gog auth tokens: ${String(err)}`);
    }

    // Clear the embedded OpenClaw state/logs, downloaded whisper models/ffmpeg,
    // and any temp files we created under userData.
    const tmpDir = path.join(userData, "tmp");
    for (const dir of [stateDir, logsDir, whisperDataDir, tmpDir]) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (err) {
        warnings.push(`failed to delete ${dir}: ${String(err)}`);
      }
    }

    // Clear renderer storage (localStorage/IndexedDB/etc.) so onboarding state is reset too.
    try {
      await session.defaultSession.clearStorageData();
    } catch (err) {
      warnings.push(`failed to clear renderer storage: ${String(err)}`);
    }

    // Relaunch the app after reset so the user lands on a fresh onboarding screen.
    setTimeout(() => {
      try {
        app.relaunch();
        app.quit();
      } catch {
        // ignore
      }
      setTimeout(() => {
        try {
          app.exit(0);
        } catch {
          // ignore
        }
      }, 2000);
    }, 25);

    const res: ResetAndCloseResult = warnings.length > 0 ? { ok: true, warnings } : { ok: true };
    return res;
  });
}
