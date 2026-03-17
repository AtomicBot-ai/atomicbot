import type { BrowserWindow } from "electron";
import type { ChildProcess } from "node:child_process";

import type { SigmaRuntimeMode } from "../../../shared/sigma/types";

export type SigmaHandlerParams = {
  getMainWindow: () => BrowserWindow | null;
  serverProcess: { current: ChildProcess | null };
  runtimeMode: { current: SigmaRuntimeMode };
};
