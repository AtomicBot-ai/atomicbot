/**
 * Central IPC handler orchestrator.
 * Each domain has been extracted into its own module; this file
 * composes them all into a single registration call.
 */
import { ipcMain } from "electron";

import { registerGogIpcHandlers } from "../gog/ipc";
import { getExtraModels } from "../gateway/extra-models";
import { registerLlamacppIpcHandlers } from "../llamacpp/ipc";
import { registerResetAndCloseIpcHandler } from "../reset/ipc";
import { registerWhisperIpcHandlers } from "../whisper/ipc";
import { registerAnalyticsHandlers } from "./analytics-ipc";

import type { RegisterParams } from "./types";
import { registerAuthHandlers } from "./auth-ipc";
import { registerFileHandlers } from "./files";
import { registerKeyHandlers } from "./keys-ipc";
import { registerMemoHandlers } from "./memo-ipc";
import { registerRemindctlHandlers } from "./remindctl-ipc";
import { registerObsidianHandlers } from "./obsidian-ipc";
import { registerGhHandlers } from "./gh-ipc";
import { registerConfigHandlers } from "./config-ipc";
import { registerOAuthHandlers } from "./oauth-ipc";
import { registerUpdaterIpcHandlers } from "./updater-ipc";
import { registerSkillHandlers } from "./skills-ipc";
import { registerBackupHandlers } from "./backup-ipc";
import { registerClawHubHandlers } from "./clawhub-ipc";
import { registerDefenderHandlers } from "./defender-ipc";
import { registerNotificationHandlers } from "./notifications-ipc";
import { IPC } from "../../shared/ipc-channels";

export { type RegisterParams } from "./types";

export function registerIpcHandlers(params: RegisterParams) {
  registerAuthHandlers(params);
  registerFileHandlers(params);
  registerKeyHandlers(params);
  registerMemoHandlers(params);
  registerRemindctlHandlers(params);
  registerObsidianHandlers(params);
  registerGhHandlers(params);
  registerConfigHandlers(params);
  registerOAuthHandlers(params);
  registerUpdaterIpcHandlers();
  registerSkillHandlers(params);
  registerBackupHandlers(params);
  registerClawHubHandlers();
  registerDefenderHandlers(params);
  registerNotificationHandlers(params);

  registerGogIpcHandlers(params);
  registerWhisperIpcHandlers(params);
  registerLlamacppIpcHandlers(params);
  registerResetAndCloseIpcHandler(params);
  registerAnalyticsHandlers(params);

  ipcMain.handle(IPC.extraModels, () => getExtraModels());
}
