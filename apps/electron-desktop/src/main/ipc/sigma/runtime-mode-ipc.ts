import { ipcMain } from "electron";

import { SIGMA_IPC } from "../../../shared/sigma/ipc-channels";
import type { SigmaRuntimeMode } from "../../../shared/sigma/types";
import type { SigmaHandlerParams } from "./types";

export function registerSigmaRuntimeModeHandlers(params: SigmaHandlerParams): void {
  ipcMain.handle(SIGMA_IPC.setRuntimeMode, async (_evt, payload: { mode: SigmaRuntimeMode }) => {
    params.runtimeMode.current = payload.mode;
    return { ok: true };
  });

  ipcMain.handle(SIGMA_IPC.getRuntimeMode, async () => {
    return { mode: params.runtimeMode.current };
  });
}
