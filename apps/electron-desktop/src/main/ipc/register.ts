/**
 * Central IPC handler orchestrator.
 * Each domain has been extracted into its own module; this file
 * composes them all into a single registration call.
 */
import { registerGogIpcHandlers } from "../gog/ipc";
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
import { registerDefenderHandlers } from "./defender-ipc";

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
  registerDefenderHandlers(params);

  registerGogIpcHandlers(params);
  registerWhisperIpcHandlers(params);
  registerResetAndCloseIpcHandler(params);
  registerAnalyticsHandlers(params);
}
