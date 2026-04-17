import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

import { getPlatform } from "@electron-main/platform";
import type { Platform } from "@electron-main/platform";
import { waitForPortOpen, type TailBuffer } from "@electron-main/util/net";
import {
  writeGatewayPid,
  removeGatewayPid,
} from "@electron-main/gateway/pid-file";
import {
  writeGatewayInfoFile,
  removeGatewayInfoFile,
} from "@electron-main/gateway/gateway-info-file";

import type { GatewayState } from "./types";
import { spawnGatewayClean } from "./spawn-clean";

/**
 * Minimal in-memory state for the launcher — equivalent to AppState in
 * apps/electron-desktop, stripped to just what the gateway supervisor needs.
 */
export interface LauncherState {
  gateway: ChildProcess | null;
  gatewayPid: number | null;
  gatewayState: GatewayState | null;
  isQuitting: boolean;
}

export function createLauncherState(): LauncherState {
  return { gateway: null, gatewayPid: null, gatewayState: null, isQuitting: false };
}

/**
 * Clean fork of apps/electron-desktop/src/main/gateway/lifecycle.ts:
 *   - no BrowserWindow / IPC_EVENTS — broadcasts state via EventEmitter instead
 *   - no whisper data dir — launcher doesn't bundle whisper models
 *   - no BinaryPaths — launcher relies on host PATH + bundled node
 */
export function broadcastGatewayState(
  events: EventEmitter,
  gwState: GatewayState,
  state: LauncherState
): void {
  state.gatewayState = gwState;
  try {
    writeGatewayInfoFile(gwState);
  } catch (err) {
    console.warn("[launcher] writeGatewayInfoFile failed:", err);
  }
  events.emit("state", gwState);
}

export async function stopGatewayChild(
  state: LauncherState,
  platform: Platform
): Promise<void> {
  try {
    removeGatewayInfoFile();
  } catch {
    // best effort
  }
  const pid = state.gatewayPid;
  state.gateway = null;
  if (!pid) {
    return;
  }

  try {
    platform.killProcess(pid);
  } catch {
    state.gatewayPid = null;
    return;
  }

  const gracefulDeadline = Date.now() + 5000;
  while (Date.now() < gracefulDeadline) {
    if (!platform.isProcessAlive(pid)) {
      state.gatewayPid = null;
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  try {
    platform.killProcessTree(pid);
  } catch {
    // already dead
  }

  const killDeadline = Date.now() + 2000;
  while (Date.now() < killDeadline) {
    if (!platform.isProcessAlive(pid)) {
      break;
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  state.gatewayPid = null;
}

export interface GatewayStarterDeps {
  state: LauncherState;
  events: EventEmitter;
  stderrTail: TailBuffer;
  port: number;
  logsDir: string;
  stateDir: string;
  configPath: string;
  getToken: () => string;
  url: string;
  openclawDir: string;
  nodeBin: string;
  browserExecutablePath?: string;
}

/** Factory returning an idempotent start function. */
export function createCleanGatewayStarter(
  deps: GatewayStarterDeps
): (opts?: { silent?: boolean }) => Promise<void> {
  const { state, events, stderrTail } = deps;
  const platform = getPlatform();

  return async (opts?: { silent?: boolean }): Promise<void> => {
    if (state.gateway) {
      return;
    }
    const token = deps.getToken();
    if (!opts?.silent) {
      broadcastGatewayState(
        events,
        { kind: "starting", port: deps.port, logsDir: deps.logsDir, token },
        state
      );
    }
    state.gateway = spawnGatewayClean({
      port: deps.port,
      logsDir: deps.logsDir,
      stateDir: deps.stateDir,
      configPath: deps.configPath,
      token,
      openclawDir: deps.openclawDir,
      nodeBin: deps.nodeBin,
      browserExecutablePath: deps.browserExecutablePath,
      stderrTail,
    });

    const thisPid = state.gateway.pid ?? null;
    state.gatewayPid = thisPid;
    if (thisPid) {
      writeGatewayPid(deps.stateDir, thisPid);
    }

    state.gateway.on("exit", (code, signal) => {
      const expected = state.isQuitting || state.gatewayPid !== thisPid;
      console.log(
        `[launcher] gateway exited: code=${code} signal=${signal} pid=${thisPid} expected=${expected}`
      );
      if (!expected) {
        console.warn(
          `[launcher] gateway exited unexpectedly. stderr tail:\n${stderrTail.read().trim() || "<empty>"}`
        );
      }
      if (state.gatewayPid === thisPid) {
        state.gateway = null;
        state.gatewayPid = null;
        removeGatewayPid(deps.stateDir);
        try {
          removeGatewayInfoFile();
        } catch {
          // best effort
        }
      }
    });

    const startupTimeoutMs = platform.gatewaySpawnOptions().startupTimeoutMs;
    const ok = await waitForPortOpen("127.0.0.1", deps.port, startupTimeoutMs);
    if (!ok) {
      const timeoutSec = startupTimeoutMs / 1000;
      const details = [
        `Gateway did not open port within ${timeoutSec}s.`,
        "",
        `openclawDir: ${deps.openclawDir}`,
        `nodeBin: ${deps.nodeBin}`,
        `stderr (tail):`,
        stderrTail.read().trim() || "<empty>",
        "",
        `See logs in: ${deps.logsDir}`,
      ].join("\n");
      broadcastGatewayState(
        events,
        { kind: "failed", port: deps.port, logsDir: deps.logsDir, details, token },
        state
      );
      return;
    }

    broadcastGatewayState(
      events,
      { kind: "ready", port: deps.port, logsDir: deps.logsDir, url: deps.url, token },
      state
    );
  };
}
