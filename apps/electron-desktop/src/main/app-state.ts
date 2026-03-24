import type { BrowserWindow, Tray } from "electron";
import type { ChildProcess } from "node:child_process";
import type { GatewayState } from "./types";
// sigma: Local LLM types
import type { SigmaRuntimeMode } from "../shared/sigma/types";

/**
 * Mutable application state that was previously spread across module-level
 * variables in main.ts. Encapsulating it in a single object makes
 * dependencies explicit and simplifies testing.
 */
export interface AppState {
  mainWindow: BrowserWindow | null;
  tray: Tray | null;
  preloadPath: string | null;
  rendererIndex: string | null;
  gateway: ChildProcess | null;
  gatewayPid: number | null;
  gatewayStateDir: string | null;
  logsDirForUi: string | null;
  gatewayState: GatewayState | null;
  consentAccepted: boolean;
  onboarded: boolean;
  isQuitting: boolean;
  // sigma: Local LLM process state
  sigmaServerProcess: { current: ChildProcess | null };
  sigmaRuntimeMode: { current: SigmaRuntimeMode };
}

export function createAppState(): AppState {
  return {
    mainWindow: null,
    tray: null,
    preloadPath: null,
    rendererIndex: null,
    gateway: null,
    gatewayPid: null,
    gatewayStateDir: null,
    logsDirForUi: null,
    gatewayState: null,
    consentAccepted: false,
    onboarded: false,
    isQuitting: false,
    // sigma: Local LLM defaults
    sigmaServerProcess: { current: null },
    sigmaRuntimeMode: { current: "openclaw" },
  };
}
