import { clearCoordMap } from "./coord-mapping.js";
import { forceHideOverlay } from "./overlay/index.js";
import { releaseLock } from "./session-lock.js";

let registered = false;

export function registerCleanupHandlers(): void {
  if (registered) return;
  registered = true;

  const cleanup = (): void => {
    clearCoordMap();
  };

  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    forceHideOverlay().catch(() => {});
    releaseLock().catch(() => {});
    cleanup();
  });
  process.on("SIGTERM", () => {
    forceHideOverlay().catch(() => {});
    releaseLock().catch(() => {});
    cleanup();
  });
}
