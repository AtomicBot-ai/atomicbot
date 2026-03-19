import { ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels";
import { readAnalyticsState, writeAnalyticsState } from "../analytics/analytics-state";
import { optInMain, optOutMain } from "../analytics/posthog-main";
import type { AnalyticsHandlerParams } from "./types";

export function registerAnalyticsHandlers({ stateDir }: AnalyticsHandlerParams): void {
  ipcMain.handle(IPC.analyticsGet, async () => {
    const state = readAnalyticsState(stateDir);
    return { enabled: state.enabled, userId: state.userId, prompted: state.prompted === true };
  });

  ipcMain.handle(IPC.analyticsSet, async (_evt, { enabled }: { enabled: boolean }) => {
    const current = readAnalyticsState(stateDir);
    const next = {
      ...current,
      enabled,
      prompted: true,
      enabledAt: enabled ? (current.enabledAt ?? new Date().toISOString()) : undefined,
    };
    writeAnalyticsState(stateDir, next);

    if (enabled) {
      optInMain(current.userId);
    } else {
      optOutMain();
    }

    return { ok: true as const };
  });
}
