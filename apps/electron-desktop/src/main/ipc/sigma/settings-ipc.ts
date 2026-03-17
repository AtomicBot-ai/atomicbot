import { ipcMain } from "electron";

import { SIGMA_IPC } from "../../../shared/sigma/ipc-channels";
import { loadSettings, setCtxSize, setGpuLayers, setPort } from "../../sigma/services/settings";

export function registerSigmaSettingsHandlers(): void {
  ipcMain.handle(SIGMA_IPC.settingsGet, async () => {
    return loadSettings();
  });

  ipcMain.handle(SIGMA_IPC.settingsSetPort, async (_evt, payload: { port: number }) => {
    setPort(payload.port);
    return `Port set to: ${payload.port}`;
  });

  ipcMain.handle(SIGMA_IPC.settingsSetCtxSize, async (_evt, payload: { ctxSize: number }) => {
    setCtxSize(payload.ctxSize);
    return `Context size set to: ${payload.ctxSize}`;
  });

  ipcMain.handle(SIGMA_IPC.settingsSetGpuLayers, async (_evt, payload: { gpuLayers: number }) => {
    setGpuLayers(payload.gpuLayers);
    return `GPU layers set to: ${payload.gpuLayers}`;
  });
}
