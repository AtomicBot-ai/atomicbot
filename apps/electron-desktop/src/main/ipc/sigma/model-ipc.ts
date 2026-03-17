import { ipcMain } from "electron";

import { SIGMA_IPC } from "../../../shared/sigma/ipc-channels";
import {
  checkModelDownloaded,
  deleteModel,
  listAvailableModels,
} from "../../sigma/services/download";
import { getActiveModel, setActiveModel } from "../../sigma/services/settings";

export function registerSigmaModelHandlers(): void {
  ipcMain.handle(SIGMA_IPC.modelList, async () => {
    return listAvailableModels();
  });

  ipcMain.handle(SIGMA_IPC.modelCheck, async (_evt, payload: { modelName: string }) => {
    return checkModelDownloaded(payload.modelName);
  });

  ipcMain.handle(SIGMA_IPC.modelDelete, async (_evt, payload: { modelName: string }) => {
    deleteModel(payload.modelName);
    return `Model '${payload.modelName}' has been deleted`;
  });

  ipcMain.handle(SIGMA_IPC.modelGetActive, async () => {
    return getActiveModel();
  });

  ipcMain.handle(SIGMA_IPC.modelSetActive, async (_evt, payload: { modelName: string }) => {
    setActiveModel(payload.modelName);
    return `Active model set to: ${payload.modelName}`;
  });
}
