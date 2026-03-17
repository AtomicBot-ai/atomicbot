import { ipcMain } from "electron";

import { SIGMA_IPC, SIGMA_IPC_EVENTS } from "../../../shared/sigma/ipc-channels";
import type { SigmaDownloadProgress } from "../../../shared/sigma/types";
import {
  checkLlamaVersion,
  downloadLlamaCpp,
  downloadModelByName,
} from "../../sigma/services/download";
import type { SigmaHandlerParams } from "./types";

export function registerSigmaDownloadHandlers(params: SigmaHandlerParams): void {
  const emitProgress = (progress: SigmaDownloadProgress) => {
    const win = params.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(SIGMA_IPC_EVENTS.downloadProgress, progress);
    }
  };

  ipcMain.handle(SIGMA_IPC.downloadCheckLlama, async (): Promise<boolean> => {
    return checkLlamaVersion();
  });

  ipcMain.handle(SIGMA_IPC.downloadLlama, async (): Promise<string> => {
    return downloadLlamaCpp(emitProgress);
  });

  ipcMain.handle(
    SIGMA_IPC.downloadModel,
    async (_evt, payload: { modelName: string }): Promise<string> => {
      return downloadModelByName(payload.modelName, emitProgress);
    }
  );
}
