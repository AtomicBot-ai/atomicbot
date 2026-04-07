import { clearCoordMap } from "./coord-mapping.js";
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
    releaseLock().catch(() => {});
    cleanup();
  });
  process.on("SIGTERM", () => {
    releaseLock().catch(() => {});
    cleanup();
  });
}
