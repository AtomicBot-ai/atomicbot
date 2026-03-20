import { vi } from "vitest";

// Global mocks for Electron-specific modules that are unavailable in a Node test environment.
vi.mock("electron", () => import("./mocks/electron"));
vi.mock("node-pty", () => import("./mocks/node-pty"));

// Electron's process.resourcesPath is only defined in packaged apps.
// Set a mock value so path resolution code doesn't crash.
if (!(process as unknown as Record<string, unknown>).resourcesPath) {
  Object.defineProperty(process, "resourcesPath", {
    value: "/mock/resources",
    writable: true,
    configurable: true,
  });
}
