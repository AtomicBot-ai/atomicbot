import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain, Notification as NotificationMock, BrowserWindow, app } from "electron";

import { registerNotificationHandlers } from "./notifications-ipc";
import { IPC } from "../../shared/ipc-channels";

type Handler = (evt: unknown, payload: unknown) => Promise<unknown>;

function getHandler(): Handler {
  const call = vi
    .mocked(ipcMain.handle)
    .mock.calls.find((c) => c[0] === IPC.notificationsShow);
  if (!call) {
    throw new Error(`handler not registered: ${IPC.notificationsShow}`);
  }
  return call[1] as Handler;
}

function makeWindow(overrides: Partial<InstanceType<typeof BrowserWindow>> = {}) {
  const win = new BrowserWindow();
  Object.assign(win, overrides);
  return win;
}

describe("notifications-ipc", () => {
  beforeEach(() => {
    vi.mocked(ipcMain.handle).mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (NotificationMock as any).isSupported = vi.fn(() => true);
  });

  it("skips notification when window is focused and visible", async () => {
    const win = makeWindow();
    win.isFocused = vi.fn(() => true);
    win.isVisible = vi.fn(() => true);
    win.isMinimized = vi.fn(() => false);

    registerNotificationHandlers({ getMainWindow: () => win });

    const result = await getHandler()({}, { title: "t", body: "b" });
    expect(result).toEqual({ shown: false });
  });

  it("shows notification when window is minimized", async () => {
    const win = makeWindow();
    win.isFocused = vi.fn(() => false);
    win.isVisible = vi.fn(() => true);
    win.isMinimized = vi.fn(() => true);

    registerNotificationHandlers({ getMainWindow: () => win });

    const result = await getHandler()({}, { title: "t", body: "b" });
    expect(result).toEqual({ shown: true });
  });

  it("shows notification when window is not focused", async () => {
    const win = makeWindow();
    win.isFocused = vi.fn(() => false);
    win.isVisible = vi.fn(() => true);
    win.isMinimized = vi.fn(() => false);

    registerNotificationHandlers({ getMainWindow: () => win });

    const result = await getHandler()({}, { title: "Ready", body: "Done" });
    expect(result).toEqual({ shown: true });
  });

  it("shows notification when main window is absent", async () => {
    registerNotificationHandlers({ getMainWindow: () => null });
    const result = await getHandler()({}, { title: "Ready", body: "Done" });
    expect(result).toEqual({ shown: true });
  });

  it("returns shown=false when system notifications are unsupported", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (NotificationMock as any).isSupported = vi.fn(() => false);
    const win = makeWindow();
    win.isFocused = vi.fn(() => false);

    registerNotificationHandlers({ getMainWindow: () => win });

    const result = await getHandler()({}, { title: "t", body: "b" });
    expect(result).toEqual({ shown: false });
  });

  it("always shows when onlyIfBackgrounded is false, even if focused", async () => {
    const win = makeWindow();
    win.isFocused = vi.fn(() => true);
    win.isVisible = vi.fn(() => true);
    win.isMinimized = vi.fn(() => false);

    registerNotificationHandlers({ getMainWindow: () => win });

    const result = await getHandler()(
      {},
      { title: "t", body: "b", onlyIfBackgrounded: false }
    );
    expect(result).toEqual({ shown: true });
  });

  it("falls back to default title when empty", async () => {
    const win = makeWindow();
    win.isFocused = vi.fn(() => false);

    const ctorSpy = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const OriginalCtor = (NotificationMock as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (NotificationMock as any).prototype.constructor = function (options: unknown) {
      ctorSpy(options);
      return new OriginalCtor(options);
    };

    registerNotificationHandlers({ getMainWindow: () => win });
    const result = await getHandler()({}, { title: "   ", body: "b" });
    expect(result).toEqual({ shown: true });
  });

  it("on Windows, calls flashFrame on the main window", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    try {
      const win = makeWindow();
      win.isFocused = vi.fn(() => false);

      registerNotificationHandlers({ getMainWindow: () => win });
      await getHandler()({}, { title: "t", body: "b" });
      expect(win.flashFrame).toHaveBeenCalledWith(true);
    } finally {
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
    }
  });

  it("on macOS, calls app.dock.bounce", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    try {
      const win = makeWindow();
      win.isFocused = vi.fn(() => false);

      registerNotificationHandlers({ getMainWindow: () => win });
      await getHandler()({}, { title: "t", body: "b" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((app as any).dock.bounce).toHaveBeenCalled();
    } finally {
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
    }
  });
});
