import { app, Menu, nativeImage, Tray } from "electron";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createTray, getTrayIconPath, getWindowIconPath } from "./tray";

describe("getTrayIconPath", () => {
  it("returns assets path relative to mainDir in dev mode", () => {
    (app as unknown as Record<string, boolean>).isPackaged = false;
    const result = getTrayIconPath("/app/src");
    expect(result).toBe(path.join("/app/src", "..", "assets", "trayTemplate.png"));
  });

  it("returns resources path in packaged mode", () => {
    (app as unknown as Record<string, boolean>).isPackaged = true;
    const result = getTrayIconPath("/app/src");
    expect(result).toBe(path.join(process.resourcesPath, "assets", "trayTemplate.png"));
    (app as unknown as Record<string, boolean>).isPackaged = false;
  });
});

describe("getWindowIconPath", () => {
  const originalPlatform = process.platform;

  it("returns undefined on non-win32 platforms", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    expect(getWindowIconPath("/app/src")).toBeUndefined();
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("returns icon.ico path on win32 in dev mode", () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    (app as unknown as Record<string, boolean>).isPackaged = false;
    const result = getWindowIconPath("/app/src");
    expect(result).toBe(path.join("/app/src", "..", "assets", "icon.ico"));
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("returns resources path on win32 in packaged mode", () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    (app as unknown as Record<string, boolean>).isPackaged = true;
    const result = getWindowIconPath("/app/src");
    expect(result).toBe(path.join(process.resourcesPath, "assets", "icon.ico"));
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    (app as unknown as Record<string, boolean>).isPackaged = false;
  });
});

describe("createTray", () => {
  it("creates a tray with the correct tooltip", () => {
    const onShow = vi.fn();
    const onQuit = vi.fn();
    const tray = createTray({
      mainDir: "/app/src",
      trayIconIsTemplate: false,
      onShow,
      onQuit,
    });
    expect(tray).toBeInstanceOf(Tray);
    expect(tray.setToolTip).toHaveBeenCalledWith("Atomic Claw");
  });

  it("sets template image when trayIconIsTemplate is true", () => {
    (nativeImage.createFromPath as ReturnType<typeof vi.fn>).mockClear();
    const tray = createTray({
      mainDir: "/app/src",
      trayIconIsTemplate: true,
      onShow: vi.fn(),
      onQuit: vi.fn(),
    });
    const results = (nativeImage.createFromPath as ReturnType<typeof vi.fn>).mock.results;
    const img = results[results.length - 1].value;
    expect(img.setTemplateImage).toHaveBeenCalledWith(true);
    expect(tray).toBeTruthy();
  });

  it("does not set template image when trayIconIsTemplate is false", () => {
    (nativeImage.createFromPath as ReturnType<typeof vi.fn>).mockClear();
    createTray({
      mainDir: "/app/src",
      trayIconIsTemplate: false,
      onShow: vi.fn(),
      onQuit: vi.fn(),
    });
    const results = (nativeImage.createFromPath as ReturnType<typeof vi.fn>).mock.results;
    const img = results[results.length - 1].value;
    expect(img.setTemplateImage).not.toHaveBeenCalled();
  });

  it("sets context menu with Show and Quit items", () => {
    createTray({
      mainDir: "/app/src",
      trayIconIsTemplate: false,
      onShow: vi.fn(),
      onQuit: vi.fn(),
    });
    expect(Menu.buildFromTemplate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ label: "Show Atomic Claw" }),
        expect.objectContaining({ label: "Quit" }),
      ])
    );
  });

  it("registers click and right-click handlers", () => {
    const tray = createTray({
      mainDir: "/app/src",
      trayIconIsTemplate: false,
      onShow: vi.fn(),
      onQuit: vi.fn(),
    });
    expect(tray.on).toHaveBeenCalledWith("click", expect.any(Function));
    expect(tray.on).toHaveBeenCalledWith("right-click", expect.any(Function));
  });
});
