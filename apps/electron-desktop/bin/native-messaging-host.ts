/**
 * Native Messaging Host for Sigma Eclipse Agent (Browser Extension ↔ Gateway + LLM)
 *
 * Implements Chrome Native Messaging Protocol so the browser extension
 * can query the electron-desktop Gateway's connection parameters and
 * control the local LLM server (start/stop/status).
 *
 * Host name: com.sigma_eclipse.agent
 *
 * https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
 */

import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { type ChildProcess, execSync, spawn } from "node:child_process";

import {
  getStatus,
  startServerProcess,
  stopServerByPid,
} from "../src/main/sigma/services/server-manager";
import { getServerSettings } from "../src/main/sigma/services/settings";
import { isAppRunning, readIpcState } from "../src/main/sigma/services/ipc-state";

// ---------------------------------------------------------------------------
// Shared data directory (must stay in sync with gateway-info-file.ts)
// ---------------------------------------------------------------------------

function getPlatformDataDir(): string {
  switch (process.platform) {
    case "darwin":
      return path.join(os.homedir(), "Library", "Application Support");
    case "win32":
      return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    default:
      return process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  }
}

function getSharedDataDir(): string {
  return path.join(getPlatformDataDir(), "com.sigma-eclipse.llm");
}

// ---------------------------------------------------------------------------
// Gateway info
// ---------------------------------------------------------------------------

interface GatewayInfoOnDisk {
  url: string;
  port: number;
  token: string;
  ready: boolean;
}

function readGatewayInfoFromDisk(): GatewayInfoOnDisk {
  const infoPath = path.join(getSharedDataDir(), "gateway-info.json");
  try {
    const raw = fs.readFileSync(infoPath, "utf-8");
    return JSON.parse(raw) as GatewayInfoOnDisk;
  } catch {
    return { url: "", port: 0, token: "", ready: false };
  }
}

const HEALTH_CHECK_TIMEOUT_MS = 2000;

/**
 * TCP-level probe: try to reach the gateway URL.
 * Returns true only if the server responds within the timeout.
 */
function probeGateway(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      req.destroy();
      resolve(false);
    }, HEALTH_CHECK_TIMEOUT_MS);

    const req = http.get(url, (res) => {
      clearTimeout(timer);
      res.resume();
      resolve(true);
    });

    req.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

/**
 * Read gateway info from disk, then verify the gateway is actually
 * reachable when the file claims `ready: true`.
 */
async function readGatewayInfo(): Promise<GatewayInfoOnDisk> {
  const info = readGatewayInfoFromDisk();
  if (!info.ready || !info.url) return info;

  const alive = await probeGateway(info.url);
  if (!alive) {
    return { ...info, ready: false };
  }
  return info;
}

// ---------------------------------------------------------------------------
// Native Messaging Protocol
// ---------------------------------------------------------------------------

function readMessage(): Promise<{ id: string; command: string; params?: unknown }> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const lengthBuf = Buffer.alloc(4);
    let bytesRead = 0;

    const readLength = () => {
      const chunk = stdin.read(4 - bytesRead);
      if (chunk === null) {
        stdin.once("readable", readLength);
        return;
      }
      chunk.copy(lengthBuf, bytesRead);
      bytesRead += chunk.length;

      if (bytesRead < 4) {
        stdin.once("readable", readLength);
        return;
      }

      const length = lengthBuf.readUInt32LE(0);
      readBody(length);
    };

    const readBody = (length: number) => {
      let bodyBuf = Buffer.alloc(0);

      const readChunk = () => {
        const remaining = length - bodyBuf.length;
        const chunk = stdin.read(remaining);
        if (chunk === null) {
          stdin.once("readable", readChunk);
          return;
        }
        bodyBuf = Buffer.concat([bodyBuf, chunk]);

        if (bodyBuf.length < length) {
          stdin.once("readable", readChunk);
          return;
        }

        try {
          const msg = JSON.parse(bodyBuf.toString("utf-8"));
          resolve(msg);
        } catch (e) {
          reject(e);
        }
      };

      readChunk();
    };

    stdin.once("readable", readLength);
  });
}

const stdoutLock = { locked: false, queue: [] as Array<() => void> };

function acquireStdoutLock(): Promise<void> {
  return new Promise((resolve) => {
    if (!stdoutLock.locked) {
      stdoutLock.locked = true;
      resolve();
    } else {
      stdoutLock.queue.push(resolve);
    }
  });
}

function releaseStdoutLock(): void {
  const next = stdoutLock.queue.shift();
  if (next) {
    next();
  } else {
    stdoutLock.locked = false;
  }
}

async function sendMessage(obj: unknown): Promise<void> {
  await acquireStdoutLock();
  try {
    const json = JSON.stringify(obj);
    const buf = Buffer.from(json, "utf-8");
    const header = Buffer.alloc(4);
    header.writeUInt32LE(buf.length, 0);
    process.stdout.write(header);
    process.stdout.write(buf);
  } finally {
    releaseStdoutLock();
  }
}

// ---------------------------------------------------------------------------
// Logging (file only — stdout is reserved for the protocol)
// ---------------------------------------------------------------------------

let logFile: fs.WriteStream | null = null;

function initLog(): void {
  try {
    const dir = getSharedDataDir();
    fs.mkdirSync(dir, { recursive: true });
    const logPath = path.join(dir, "agent-native-host.log");
    logFile = fs.createWriteStream(logPath, { flags: "w" });
  } catch {
    // Logging is best-effort.
  }
}

function log(msg: string): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  process.stderr.write(`[AgentHost] ${msg}\n`);
  logFile?.write(line);
}

// ---------------------------------------------------------------------------
// LLM server process (local to this native host process)
// ---------------------------------------------------------------------------

let serverProcess: ChildProcess | null = null;

// ---------------------------------------------------------------------------
// Status monitoring — push gateway + LLM status changes to the extension
// ---------------------------------------------------------------------------

interface CachedStatus {
  gatewayReady: boolean;
  appRunning: boolean;
  modelRunning: boolean;
  isDownloading: boolean;
  downloadProgress: number | null;
}

let cachedStatus: CachedStatus | null = null;
let shouldExit = false;
let statusCheckInFlight = false;

async function checkAndPushStatus(): Promise<void> {
  if (statusCheckInFlight) return;
  statusCheckInFlight = true;
  try {
    const info = await readGatewayInfo();

    const appRunning = isAppRunning();
    const { isRunning: modelRunning } = getStatus();
    const ipcState = readIpcState();

    const newStatus: CachedStatus = {
      gatewayReady: info.ready,
      appRunning,
      modelRunning,
      isDownloading: ipcState.is_downloading,
      downloadProgress: ipcState.download_progress,
    };

    const changed =
      cachedStatus === null ||
      cachedStatus.gatewayReady !== newStatus.gatewayReady ||
      cachedStatus.appRunning !== newStatus.appRunning ||
      cachedStatus.modelRunning !== newStatus.modelRunning ||
      cachedStatus.isDownloading !== newStatus.isDownloading ||
      cachedStatus.downloadProgress !== newStatus.downloadProgress;

    if (changed) {
      // Push gateway status (for agent-native-client compatibility)
      if (cachedStatus === null || cachedStatus.gatewayReady !== newStatus.gatewayReady) {
        void sendMessage({
          type: "gateway_status_update",
          data: { ready: info.ready, url: info.url, port: info.port },
        });
      }

      // Push LLM status (for sigma-eclipse-client compatibility)
      void sendMessage({
        type: "status_update",
        data: {
          appRunning: newStatus.appRunning,
          modelRunning: newStatus.modelRunning,
          isDownloading: newStatus.isDownloading,
          downloadProgress: newStatus.downloadProgress,
        },
      });

      cachedStatus = newStatus;
    }
  } finally {
    statusCheckInFlight = false;
  }
}

function startStatusMonitor(): void {
  const poll = () => {
    if (shouldExit) return;
    checkAndPushStatus().catch((e) => {
      log(`Status monitor error: ${e}`);
    });
    setTimeout(poll, 500);
  };
  setTimeout(poll, 500);
}

// ---------------------------------------------------------------------------
// LLM command handlers
// ---------------------------------------------------------------------------

function handleStartServer(): { message: string; pid: number; port: number } {
  if (serverProcess && serverProcess.exitCode === null) {
    throw new Error("Server is already running (managed by this host)");
  }
  serverProcess = null;

  const { port, ctx_size, gpu_layers } = getServerSettings();
  const child = startServerProcess({ port, ctx_size, gpu_layers }, false);
  serverProcess = child;

  log(`Server started: port=${port}, pid=${child.pid}`);

  return {
    message: `Server started on port ${port} (PID: ${child.pid})`,
    pid: child.pid!,
    port,
  };
}

function handleStopServer(): { message: string } {
  if (serverProcess && serverProcess.pid) {
    const pid = serverProcess.pid;
    stopServerByPid(pid);
    try {
      serverProcess.kill();
    } catch {
      /* already dead */
    }
    serverProcess = null;
    log(`Server stopped: pid=${pid}`);
    return { message: "Server stopped" };
  }

  const { isRunning, pid } = getStatus();
  if (isRunning && pid) {
    stopServerByPid(pid);
    log(`Server stopped: pid=${pid}`);
    return { message: `Server stopped (PID: ${pid})` };
  }

  throw new Error("Server is not running");
}

function handleGetServerStatus(): {
  is_running: boolean;
  pid: number | null;
  port: number | null;
  message: string;
} {
  // Check local process first
  if (serverProcess) {
    if (serverProcess.exitCode === null) {
      const state = readIpcState();
      return {
        is_running: true,
        pid: serverProcess.pid ?? null,
        port: state.server_port,
        message: "Server is running",
      };
    }
    serverProcess = null;
  }

  const { isRunning, pid } = getStatus();
  const state = readIpcState();
  return {
    is_running: isRunning,
    pid,
    port: state.server_port,
    message: isRunning ? "Server is running" : "Server is not running",
  };
}

function handleGetAppStatus(): { is_running: boolean; message: string } {
  const running = isAppRunning();
  return {
    is_running: running,
    message: running ? "App is running" : "App is not running",
  };
}

function handleIsDownloading(): { is_downloading: boolean; progress: number | null } {
  const state = readIpcState();
  return {
    is_downloading: state.is_downloading,
    progress: state.download_progress,
  };
}

function handleLaunchApp(): { launched: boolean; message: string } {
  if (isAppRunning()) {
    return { launched: false, message: "App is already running" };
  }

  if (process.platform === "darwin") {
    try {
      execSync('open -b "ai.sigmaeclipse.desktop"', { timeout: 5000 });
      log("App launched via bundle id");
      return { launched: true, message: "App launched successfully" };
    } catch {
      /* fallback */
    }

    try {
      execSync('open -a "Sigma Eclipse"', { timeout: 5000 });
      log("App launched via app name");
      return { launched: true, message: "App launched successfully" };
    } catch {
      /* fallback */
    }

    throw new Error("Failed to launch app");
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const possiblePaths = [
      path.join(localAppData, "Sigma Eclipse", "Sigma Eclipse.exe"),
      path.join(localAppData, "Programs", "Sigma Eclipse", "Sigma Eclipse.exe"),
      path.join(localAppData, "sigma-eclipse-desktop", "Sigma Eclipse.exe"),
    ];

    for (const exePath of possiblePaths) {
      if (fs.existsSync(exePath)) {
        try {
          spawn(exePath, [], { detached: true, stdio: "ignore", windowsHide: true }).unref();
          log(`App launched from: ${exePath}`);
          return { launched: true, message: "App launched successfully" };
        } catch {
          /* try next */
        }
      }
    }

    throw new Error("Could not find Sigma Eclipse executable");
  }

  // Linux
  const linuxCommands = ["sigma-eclipse", "/usr/bin/sigma-eclipse", "/usr/local/bin/sigma-eclipse"];
  for (const cmd of linuxCommands) {
    try {
      spawn(cmd, [], { detached: true, stdio: "ignore" }).unref();
      log("App launched");
      return { launched: true, message: "App launched successfully" };
    } catch {
      /* try next */
    }
  }

  throw new Error("Could not find Sigma Eclipse executable");
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

async function handleGetGatewayInfo(): Promise<GatewayInfoOnDisk> {
  return readGatewayInfo();
}

async function processCommand(
  id: string,
  command: string
): Promise<{ id: string; success: boolean; data?: unknown; error?: string }> {
  try {
    let data: unknown;
    switch (command) {
      case "get_gateway_info":
        data = await handleGetGatewayInfo();
        break;
      case "start_server":
        data = handleStartServer();
        break;
      case "stop_server":
        data = handleStopServer();
        break;
      case "get_server_status":
        data = handleGetServerStatus();
        break;
      case "get_app_status":
        data = handleGetAppStatus();
        break;
      case "isDownloading":
        data = handleIsDownloading();
        break;
      case "launch_app":
        data = handleLaunchApp();
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
    return { id, success: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`Error: ${msg} (cmd: ${command})`);
    return { id, success: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  initLog();
  log("Agent native host started");

  process.stdin.resume();
  startStatusMonitor();

  while (!shouldExit) {
    try {
      const msg = await readMessage();
      const response = await processCommand(msg.id, msg.command);
      await sendMessage(response);
    } catch {
      break;
    }
  }

  shouldExit = true;
  log("Agent native host stopped");
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(`Fatal: ${e}\n`);
  process.exit(1);
});
