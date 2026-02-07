import { app, type BrowserWindow } from "electron";
import { autoUpdater, type UpdateInfo } from "electron-updater";

// Interval between periodic update checks (4 hours).
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

// Delay before the first check after startup (30 seconds).
const INITIAL_DELAY_MS = 30_000;

let initialized = false;
let periodicTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Initialize the auto-updater. Must be called once after app is ready.
 *
 * Events are forwarded to the renderer via `webContents.send()` so the UI can
 * display notifications and progress.
 */
export function initAutoUpdater(getMainWindow: () => BrowserWindow | null): void {
  if (initialized) {
    return;
  }
  initialized = true;

  // Don't auto-download; let the user decide when to download.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    sendToRenderer(getMainWindow(), "updater-checking", {});
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    sendToRenderer(getMainWindow(), "updater-available", {
      version: info.version,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on("update-not-available", (_info: UpdateInfo) => {
    sendToRenderer(getMainWindow(), "updater-not-available", {});
  });

  autoUpdater.on("download-progress", (progress) => {
    sendToRenderer(getMainWindow(), "updater-download-progress", {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    sendToRenderer(getMainWindow(), "updater-downloaded", {
      version: info.version,
    });
  });

  autoUpdater.on("error", (err) => {
    sendToRenderer(getMainWindow(), "updater-error", {
      message: String(err?.message ?? err),
    });
  });

  // Schedule first check after a short startup delay.
  setTimeout(() => {
    void checkForUpdates();
  }, INITIAL_DELAY_MS);

  // Periodic checks.
  periodicTimer = setInterval(() => {
    void checkForUpdates();
  }, CHECK_INTERVAL_MS);
}

/** Manually trigger an update check. */
export async function checkForUpdates(): Promise<void> {
  try {
    await autoUpdater.checkForUpdates();
  } catch {
    // Silently ignore network errors during background checks.
  }
}

/** Start downloading an available update. */
export async function downloadUpdate(): Promise<void> {
  await autoUpdater.downloadUpdate();
}

/** Quit the app and install the downloaded update. */
export function installUpdate(): void {
  autoUpdater.quitAndInstall();
}

/** Get current app version for display. */
export function getAppVersion(): string {
  return app.getVersion();
}

function sendToRenderer(win: BrowserWindow | null, channel: string, payload: unknown): void {
  try {
    win?.webContents.send(channel, payload);
  } catch {
    // Window may be destroyed; ignore.
  }
}

/** Clean up timers (call on app quit). */
export function disposeAutoUpdater(): void {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
}
