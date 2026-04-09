import type { OverlayAdapter } from "./overlay-adapter.js";
import { createMacOsOverlayAdapter } from "./overlay-macos.js";
import { createNullOverlayAdapter } from "./overlay-null.js";
import { createWindowsOverlayAdapter } from "./overlay-windows.js";

export type { OverlayAdapter } from "./overlay-adapter.js";

// Debounce period: overlay stays visible between rapid consecutive actions
const HIDE_DEBOUNCE_MS = 15_000;

let cachedAdapter: OverlayAdapter | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

function createOverlayAdapter(platform: NodeJS.Platform = process.platform): OverlayAdapter {
  if (platform === "darwin") {
    return createMacOsOverlayAdapter();
  }
  if (platform === "win32") {
    return createWindowsOverlayAdapter();
  }
  return createNullOverlayAdapter();
}

function getAdapter(): OverlayAdapter {
  if (!cachedAdapter) cachedAdapter = createOverlayAdapter();
  return cachedAdapter;
}

/**
 * Show the agent-active overlay. Safe to call repeatedly —
 * cancels any pending hide timer so the overlay stays visible
 * across consecutive tool calls.
 */
export async function showOverlay(): Promise<void> {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = undefined;
  }
  try {
    await getAdapter().show();
  } catch {
    // non-critical visual indicator — swallow errors
  }
}

/**
 * Schedule overlay dismissal after a debounce period.
 * If another action starts before the timer fires, `showOverlay`
 * cancels the pending hide.
 */
export function scheduleHideOverlay(): void {
  if (hideTimer) {
    clearTimeout(hideTimer);
  }
  hideTimer = setTimeout(async () => {
    hideTimer = undefined;
    try {
      await getAdapter().hide();
    } catch {
      // non-critical
    }
  }, HIDE_DEBOUNCE_MS);
}

/** Force-hide immediately (process exit / cleanup). */
export async function forceHideOverlay(): Promise<void> {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = undefined;
  }
  try {
    await getAdapter().hide();
  } catch {
    // best-effort cleanup
  }
}
