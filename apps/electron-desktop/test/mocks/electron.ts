import { vi } from "vitest";

// Mock the "electron" module for unit testing.
// Each export mirrors the real Electron API surface used by the app.

export const app = {
  getPath: vi.fn((name: string) => `/mock/${name}`),
  getAppPath: vi.fn(() => "/mock/app"),
  getVersion: vi.fn(() => "0.0.0-test"),
  isPackaged: false,
  on: vi.fn(),
  quit: vi.fn(),
  exit: vi.fn(),
  relaunch: vi.fn(),
  requestSingleInstanceLock: vi.fn(() => true),
  setAsDefaultProtocolClient: vi.fn(() => true),
  getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
  setLoginItemSettings: vi.fn(),
  whenReady: vi.fn(() => Promise.resolve()),
  dock: {
    bounce: vi.fn(() => 0),
    show: vi.fn(() => Promise.resolve()),
    hide: vi.fn(),
  },
};

export const ipcMain = {
  handle: vi.fn(),
  on: vi.fn(),
  removeHandler: vi.fn(),
};

export const ipcRenderer = {
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
};

export const shell = {
  openPath: vi.fn(() => Promise.resolve("")),
  openExternal: vi.fn(() => Promise.resolve()),
};

export class BrowserWindow {
  webContents = {
    send: vi.fn(),
    isDevToolsOpened: vi.fn(() => false),
    openDevTools: vi.fn(),
    closeDevTools: vi.fn(),
  };
  isDestroyed = vi.fn(() => false);
  isMinimized = vi.fn(() => false);
  isVisible = vi.fn(() => true);
  isFocused = vi.fn(() => true);
  loadFile = vi.fn(() => Promise.resolve());
  show = vi.fn();
  restore = vi.fn();
  focus = vi.fn();
  blur = vi.fn();
  flashFrame = vi.fn();
  on = vi.fn();
}

class NotificationMock {
  static isSupported = vi.fn(() => true);
  show = vi.fn();
  close = vi.fn();
  private listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  on(event: string, cb: (...args: unknown[]) => void): this {
    (this.listeners[event] ??= []).push(cb);
    return this;
  }
  emit(event: string, ...args: unknown[]): void {
    (this.listeners[event] ?? []).forEach((cb) => cb(...args));
  }
  constructor(public options?: unknown) {}
}

export const Notification = NotificationMock;

export const dialog = {
  showOpenDialog: vi.fn(() => Promise.resolve({ canceled: true, filePaths: [] })),
  showSaveDialog: vi.fn(() => Promise.resolve({ canceled: true, filePath: undefined })),
};

export const contextBridge = {
  exposeInMainWorld: vi.fn(),
};

export class Tray {
  setToolTip = vi.fn();
  setContextMenu = vi.fn();
  popUpContextMenu = vi.fn();
  on = vi.fn();
}

export const Menu = {
  buildFromTemplate: vi.fn(() => ({})),
};

export const nativeImage = {
  createFromPath: vi.fn(() => ({
    setTemplateImage: vi.fn(),
  })),
};
