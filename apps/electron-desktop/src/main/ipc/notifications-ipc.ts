/**
 * IPC handler for showing OS-level notifications (macOS + Windows).
 *
 * Used to alert the user when an agent event needs attention while the
 * main window is not focused or not visible:
 *   - exec approval requested
 *   - agent run completed / errored / aborted
 *
 * The notification is suppressed when the window is currently focused AND
 * visible (user can see it already). Additionally, platform attention
 * signals are used: flashFrame on Windows, dock.bounce on macOS.
 */
import { app, ipcMain, Notification } from "electron";
import type { BrowserWindow } from "electron";

import { IPC } from "../../shared/ipc-channels";
import type {
  NotificationsShowParams,
  NotificationsShowResult,
} from "../../shared/desktop-bridge-contract";
import type { NotificationsHandlerParams } from "./types";

function isWindowBackgrounded(win: BrowserWindow): boolean {
  if (win.isDestroyed()) {
    return true;
  }
  if (win.isMinimized()) {
    return true;
  }
  if (!win.isVisible()) {
    return true;
  }
  if (!win.isFocused()) {
    return true;
  }
  return false;
}

function requestAttention(win: BrowserWindow): void {
  if (win.isDestroyed()) {
    return;
  }
  try {
    if (process.platform === "win32") {
      win.flashFrame(true);
    } else if (process.platform === "darwin" && app.dock) {
      app.dock.bounce("informational");
    }
  } catch (err) {
    console.warn("[ipc/notifications] requestAttention failed:", err);
  }
}

function focusMainWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) {
    return;
  }
  try {
    if (win.isMinimized()) {
      win.restore();
    }
    if (!win.isVisible()) {
      win.show();
    }
    if (process.platform === "win32") {
      win.flashFrame(false);
    }
    win.focus();
    if (process.platform === "darwin" && app.dock) {
      app.dock.show().catch(() => {});
    }
  } catch (err) {
    console.warn("[ipc/notifications] focusMainWindow failed:", err);
  }
}

function sanitizeString(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function registerNotificationHandlers(params: NotificationsHandlerParams): void {
  ipcMain.handle(
    IPC.notificationsShow,
    async (_evt, raw: unknown): Promise<NotificationsShowResult> => {
      const payload = (raw ?? {}) as Partial<NotificationsShowParams>;
      const title = sanitizeString(payload.title, "Atomic Bot");
      const body = sanitizeString(payload.body, "");
      const onlyIfBackgrounded = payload.onlyIfBackgrounded !== false;

      const win = params.getMainWindow();

      if (win && onlyIfBackgrounded && !isWindowBackgrounded(win)) {
        return { shown: false };
      }

      if (!Notification.isSupported()) {
        console.warn("[ipc/notifications] system notifications not supported on this platform");
        return { shown: false };
      }

      try {
        const notification = new Notification({
          title,
          body,
          silent: false,
        });

        notification.on("click", () => {
          const current = params.getMainWindow();
          if (current) {
            focusMainWindow(current);
          }
        });

        notification.show();

        if (win) {
          requestAttention(win);
        }

        return { shown: true };
      } catch (err) {
        console.error("[ipc/notifications] show failed:", err);
        return { shown: false };
      }
    }
  );
}
