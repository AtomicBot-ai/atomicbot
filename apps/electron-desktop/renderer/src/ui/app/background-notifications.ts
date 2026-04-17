/**
 * Helper for triggering OS-level notifications when the user is away
 * from the Atomic Bot window (minimized, hidden, or window not focused).
 *
 * The preference is stored in localStorage under NOTIFICATIONS_ENABLED_LS_KEY
 * and defaults to enabled. The actual focused/minimized check happens in the
 * main process (see src/main/ipc/notifications-ipc.ts).
 */
import { getDesktopApiOrNull } from "@ipc/desktopApi";

export const NOTIFICATIONS_ENABLED_LS_KEY = "atomicbot:notifications-enabled";

export function readNotificationsEnabled(): boolean {
  try {
    const value = localStorage.getItem(NOTIFICATIONS_ENABLED_LS_KEY);
    if (value === "0") {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

export function writeNotificationsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(NOTIFICATIONS_ENABLED_LS_KEY, enabled ? "1" : "0");
  } catch {
    // ignore quota / private mode
  }
}

export type BackgroundNotification = {
  title: string;
  body: string;
};

/**
 * Fire a background OS notification if the user preference allows it.
 * Silently no-ops when the desktop bridge is unavailable (e.g. tests).
 */
export function notifyInBackground(payload: BackgroundNotification): void {
  if (!readNotificationsEnabled()) {
    return;
  }
  const api = getDesktopApiOrNull();
  if (!api?.showNotification) {
    return;
  }
  void api
    .showNotification({
      title: payload.title,
      body: payload.body,
      onlyIfBackgrounded: true,
    })
    .catch((err) => {
      console.warn("[notifications] showNotification failed:", err);
    });
}
