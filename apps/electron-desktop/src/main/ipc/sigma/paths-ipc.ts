import { ipcMain } from "electron";
import * as path from "node:path";

import { SIGMA_IPC } from "../../../shared/sigma/ipc-channels";
import { getAppDataDir } from "../../sigma/services/paths";

export function registerSigmaPathsHandlers(): void {
  ipcMain.handle(SIGMA_IPC.pathsAppData, async () => {
    return getAppDataDir();
  });

  ipcMain.handle(SIGMA_IPC.pathsLogs, async () => {
    return path.join(getAppDataDir(), "logs");
  });
}
