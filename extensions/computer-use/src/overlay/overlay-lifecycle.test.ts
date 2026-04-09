import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./overlay-macos.js", () => ({
  createMacOsOverlayAdapter: () => ({
    show: vi.fn().mockResolvedValue(undefined),
    hide: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("./overlay-windows.js", () => ({
  createWindowsOverlayAdapter: () => ({
    show: vi.fn().mockResolvedValue(undefined),
    hide: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe("overlay lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("showOverlay does not throw on unsupported platforms", async () => {
    const { showOverlay } = await import("./index.js");
    await expect(showOverlay()).resolves.toBeUndefined();
  });

  it("forceHideOverlay does not throw", async () => {
    const { forceHideOverlay } = await import("./index.js");
    await expect(forceHideOverlay()).resolves.toBeUndefined();
  });

  it("scheduleHideOverlay does not throw", async () => {
    const { scheduleHideOverlay } = await import("./index.js");
    expect(() => scheduleHideOverlay()).not.toThrow();
    vi.advanceTimersByTime(5000);
  });
});
