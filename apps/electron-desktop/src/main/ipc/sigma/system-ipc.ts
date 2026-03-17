import { ipcMain } from "electron";

import { SIGMA_IPC } from "../../../shared/sigma/ipc-channels";
import {
  calculateRecommendedSettings,
  clearAllData,
  clearBinaries,
  clearModels,
  getSystemMemoryGb,
} from "../../sigma/services/system-info";
import type { SigmaHandlerParams } from "./types";

export function registerSigmaSystemHandlers(params: SigmaHandlerParams): void {
  ipcMain.handle(SIGMA_IPC.systemMemory, async () => {
    return getSystemMemoryGb();
  });

  ipcMain.handle(SIGMA_IPC.systemRecommended, async () => {
    return calculateRecommendedSettings();
  });

  ipcMain.handle(SIGMA_IPC.dataClearBinaries, async () => {
    clearBinaries(params.serverProcess);
    return "Binaries cleared successfully";
  });

  ipcMain.handle(SIGMA_IPC.dataClearModels, async () => {
    clearModels();
    return "Models cleared successfully";
  });

  ipcMain.handle(SIGMA_IPC.dataClearAll, async () => {
    clearAllData(params.serverProcess);
    return "All data cleared successfully";
  });
}
