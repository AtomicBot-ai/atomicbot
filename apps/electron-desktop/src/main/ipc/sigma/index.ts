import type { SigmaHandlerParams } from "./types";
import { registerSigmaServerHandlers } from "./server-ipc";
import { registerSigmaDownloadHandlers } from "./download-ipc";
import { registerSigmaModelHandlers } from "./model-ipc";
import { registerSigmaSettingsHandlers } from "./settings-ipc";
import { registerSigmaSystemHandlers } from "./system-ipc";
import { registerSigmaPathsHandlers } from "./paths-ipc";
import { registerSigmaRuntimeModeHandlers } from "./runtime-mode-ipc";

export type { SigmaHandlerParams } from "./types";

export function registerSigmaIpcHandlers(params: SigmaHandlerParams): void {
  registerSigmaServerHandlers(params);
  registerSigmaDownloadHandlers(params);
  registerSigmaModelHandlers();
  registerSigmaSettingsHandlers();
  registerSigmaSystemHandlers(params);
  registerSigmaPathsHandlers();
  registerSigmaRuntimeModeHandlers(params);
}
