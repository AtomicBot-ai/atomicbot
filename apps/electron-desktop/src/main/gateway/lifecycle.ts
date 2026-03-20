import type { BrowserWindow } from "electron";
import type { Platform } from "../platform";
import type { AppState } from "../app-state";
import type { BinaryPaths, GatewayState } from "../types";
import type { TailBuffer } from "../util/net";
import { IPC_EVENTS } from "../../shared/ipc-channels";
import { spawnGateway } from "./spawn";
import { writeGatewayPid, removeGatewayPid } from "./pid-file";
import { waitForPortOpen } from "../util/net";

export function broadcastGatewayState(
  win: BrowserWindow | null,
  gwState: GatewayState,
  state: AppState
): void {
  state.gatewayState = gwState;
  try {
    win?.webContents.send(IPC_EVENTS.gatewayState, gwState);
  } catch (err) {
    console.warn("[main] broadcastGatewayState failed:", err);
  }
}

export async function stopGatewayChild(state: AppState, platform: Platform): Promise<void> {
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
    // Already dead
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

export type GatewayStarterDeps = BinaryPaths & {
  state: AppState;
  platform: Platform;
  stderrTail: TailBuffer;
  ensureWindow: () => Promise<BrowserWindow | null>;
  port: number;
  logsDir: string;
  stateDir: string;
  configPath: string;
  getToken: () => string;
  url: string;
  openclawDir: string;
  nodeBin: string;
  whisperDataDir: string;
};

/**
 * Factory that captures gateway configuration and returns a start function.
 * The returned function is idempotent — calling it while the gateway is
 * already running is a no-op.
 */
export function createGatewayStarter(
  deps: GatewayStarterDeps
): (opts?: { silent?: boolean }) => Promise<void> {
  const { state, platform, stderrTail, ensureWindow } = deps;

  return async (opts?: { silent?: boolean }): Promise<void> => {
    if (state.gateway) {
      return;
    }
    const token = deps.getToken();
    const nextWin = await ensureWindow();
    if (!opts?.silent) {
      broadcastGatewayState(
        nextWin,
        { kind: "starting", port: deps.port, logsDir: deps.logsDir, token },
        state
      );
    }
    state.gateway = spawnGateway({
      port: deps.port,
      logsDir: deps.logsDir,
      stateDir: deps.stateDir,
      configPath: deps.configPath,
      token,
      openclawDir: deps.openclawDir,
      nodeBin: deps.nodeBin,
      gogBin: deps.gogBin,
      jqBin: deps.jqBin,
      memoBin: deps.memoBin,
      remindctlBin: deps.remindctlBin,
      obsidianCliBin: deps.obsidianCliBin,
      ghBin: deps.ghBin,
      whisperCliBin: deps.whisperCliBin,
      whisperDataDir: deps.whisperDataDir,
      electronRunAsNode: deps.nodeBin === process.execPath,
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
        `[main] gateway exited: code=${code} signal=${signal} pid=${thisPid} expected=${expected}`
      );
      if (!expected) {
        console.warn(
          `[main] gateway exited unexpectedly. stderr tail:\n${stderrTail.read().trim() || "<empty>"}`
        );
      }
      if (state.gatewayPid === thisPid) {
        state.gateway = null;
        state.gatewayPid = null;
        removeGatewayPid(deps.stateDir);
      }
    });

    const startupTimeoutMs = platform.gatewaySpawnOptions().startupTimeoutMs;
    const ok = await waitForPortOpen("127.0.0.1", deps.port, startupTimeoutMs);
    if (!ok) {
      const timeoutSec = startupTimeoutMs / 1000;
      const details = [
        `Gateway did not open the port within ${timeoutSec}s.`,
        "",
        `openclawDir: ${deps.openclawDir}`,
        `nodeBin: ${deps.nodeBin}`,
        `stderr (tail):`,
        stderrTail.read().trim() || "<empty>",
        "",
        `See logs in: ${deps.logsDir}`,
      ].join("\n");
      broadcastGatewayState(
        nextWin,
        { kind: "failed", port: deps.port, logsDir: deps.logsDir, details, token },
        state
      );
      return;
    }

    broadcastGatewayState(
      nextWin,
      { kind: "ready", port: deps.port, logsDir: deps.logsDir, url: deps.url, token },
      state
    );
  };
}
