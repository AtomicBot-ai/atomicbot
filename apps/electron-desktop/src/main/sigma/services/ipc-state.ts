import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

import type { SigmaIpcState } from "../../../shared/sigma/types";
import { getAppDataDir } from "./paths";

const HEARTBEAT_TIMEOUT_SECS = 10;

const DEFAULT_STATE: SigmaIpcState = {
  server_pid: null,
  server_running: false,
  is_downloading: false,
  download_progress: null,
  server_port: null,
  server_ctx_size: null,
  server_gpu_layers: null,
  app_pid: null,
  app_heartbeat: null,
};

function getIpcStatePath(): string {
  return path.join(getAppDataDir(), "ipc_state.json");
}

export function readIpcState(): SigmaIpcState {
  const statePath = getIpcStatePath();

  if (!fs.existsSync(statePath)) {
    return { ...DEFAULT_STATE };
  }

  try {
    const contents = fs.readFileSync(statePath, "utf-8");
    return JSON.parse(contents) as SigmaIpcState;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function writeIpcState(state: SigmaIpcState): void {
  const statePath = getIpcStatePath();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

export function updateServerStatus(running: boolean, pid: number | null): void {
  const state = readIpcState();
  state.server_running = running;
  state.server_pid = pid;
  writeIpcState(state);
}

export function updateDownloadStatus(isDownloading: boolean, progress: number | null): void {
  const state = readIpcState();
  state.is_downloading = isDownloading;
  state.download_progress = progress;
  writeIpcState(state);
}

export function isProcessRunning(pid: number): boolean {
  if (process.platform === "win32") {
    try {
      const output = execSync(`tasklist /FI "PID eq ${pid}"`, {
        windowsHide: true,
        encoding: "utf-8",
      });
      return output.includes(String(pid));
    } catch {
      return false;
    }
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function currentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export function updateAppHeartbeat(pid: number): void {
  const state = readIpcState();
  state.app_pid = pid;
  state.app_heartbeat = currentTimestamp();
  writeIpcState(state);
}

export function clearAppStatus(): void {
  const state = readIpcState();
  state.app_pid = null;
  state.app_heartbeat = null;
  writeIpcState(state);
}

export function isAppRunning(): boolean {
  const state = readIpcState();

  if (state.app_pid == null || state.app_heartbeat == null) {
    return false;
  }

  const now = currentTimestamp();
  if (now - state.app_heartbeat > HEARTBEAT_TIMEOUT_SECS) {
    return false;
  }

  return isProcessRunning(state.app_pid);
}
