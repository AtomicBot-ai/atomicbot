#!/usr/bin/env node
/**
 * Sigma Browser Host: headless launcher for OpenClaw Gateway.
 *
 * Spawned by the C++ SigmaGatewayManager. Its job is to:
 *   1. Run orphan cleanup (kill stale gateway from a previous crash).
 *   2. Bootstrap `openclaw.json` (first run) and run all upstream config
 *      migrations (so when OpenClaw ships v6, v7 — we get them for free).
 *   3. Patch the `sigma-local` LLM provider's baseUrl with the actual port
 *      of the C++-managed llama-server.
 *   4. Spawn `openclaw.mjs gateway` with the full env set (SIGTERM-safe).
 *   5. Expose a loopback discovery endpoint the extension can fetch for
 *      `{url, port, token, state}` — replaces Native Messaging.
 *   6. On SIGTERM/SIGINT: stop the Gateway gracefully, remove PID/info files.
 *
 * Intentionally has no Electron / BrowserWindow / IPC dependencies so it runs
 * inside a plain Node 22+ process bundled with the Sigma .app.
 */
import { parseArgs } from "node:util";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";

import {
  ensureGatewayConfigFile,
  readGatewayTokenFromConfig,
} from "@electron-main/gateway/config";
import { runConfigMigrations } from "@electron-main/gateway/config-migrations";
import {
  killOrphanedGateway,
  removeStaleGatewayLock,
  removeGatewayPid,
} from "@electron-main/gateway/pid-file";
import { removeGatewayInfoFile } from "@electron-main/gateway/gateway-info-file";
import { createTailBuffer, pickPort } from "@electron-main/util/net";
import { ensureDir } from "@electron-main/util/fs";
import { getPlatform } from "@electron-main/platform";

import {
  createLauncherState,
  createCleanGatewayStarter,
  stopGatewayChild,
} from "./lifecycle-events";
import { patchSigmaLocalProvider } from "./config-patcher";
import { startDiscoveryServer, type DiscoveryServer } from "./discovery-server";
import type { GatewayState } from "./types";

const DEFAULT_GATEWAY_PORT = 10500;
const DEFAULT_DISCOVERY_PORT = 19999;
const LOG_PREFIX = "[sigma-browser-host]";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "state-dir": { type: "string" },
      "openclaw-dir": { type: "string" },
      "node-bin": { type: "string" },
      "llama-port": { type: "string" },
      "browser-path": { type: "string" },
      "gateway-port": { type: "string", default: String(DEFAULT_GATEWAY_PORT) },
      "discovery-port": { type: "string", default: String(DEFAULT_DISCOVERY_PORT) },
      "log-level": { type: "string", default: "info" },
      help: { type: "boolean", default: false },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    printHelp();
    return;
  }

  const stateDir = requireArg(values["state-dir"], "--state-dir");
  const openclawDir = requireArg(values["openclaw-dir"], "--openclaw-dir");
  const nodeBin = values["node-bin"] ?? process.execPath;
  const llamaPortArg = values["llama-port"];
  const browserExecutablePath = values["browser-path"];
  const preferredGatewayPort = parseIntOr(values["gateway-port"], DEFAULT_GATEWAY_PORT);
  const preferredDiscoveryPort = parseIntOr(values["discovery-port"], DEFAULT_DISCOVERY_PORT);

  ensureDir(stateDir);
  const configPath = path.join(stateDir, "openclaw.json");
  const logsDir = path.join(stateDir, "logs");
  ensureDir(logsDir);

  const launcherLogPath = path.join(logsDir, "launcher.log");
  mirrorStdoutToFile(launcherLogPath);

  console.log(`${LOG_PREFIX} starting pid=${process.pid} node=${process.version}`);
  console.log(`${LOG_PREFIX} stateDir=${stateDir}`);
  console.log(`${LOG_PREFIX} openclawDir=${openclawDir}`);
  console.log(`${LOG_PREFIX} nodeBin=${nodeBin}`);

  // 1. Orphan cleanup.
  try {
    const killedPid = killOrphanedGateway(stateDir);
    if (killedPid != null) {
      console.log(`${LOG_PREFIX} killed orphan gateway pid=${killedPid}`);
    }
    removeStaleGatewayLock(configPath);
  } catch (err) {
    console.warn(`${LOG_PREFIX} orphan cleanup failed:`, err);
  }

  // 2. Pick the actual gateway port (prefer the requested one, fall back to
  //    a random free port).
  const port = await pickPort(preferredGatewayPort);
  console.log(`${LOG_PREFIX} gateway port resolved: ${port}`);

  // 3. Config bootstrap + migrations.
  const token =
    readGatewayTokenFromConfig(configPath) ??
    randomBytes(24).toString("base64url");
  ensureGatewayConfigFile({ configPath, token });
  runConfigMigrations({ configPath, stateDir });

  // 4. Patch sigma-local provider with the current llama-server port.
  const llamaPort = llamaPortArg ? parseIntOr(llamaPortArg, 0) : 0;
  if (llamaPort > 0) {
    patchSigmaLocalProvider({ configPath, llamaPort });
    console.log(`${LOG_PREFIX} sigma-local provider patched -> llamaPort=${llamaPort}`);
  } else {
    console.warn(
      `${LOG_PREFIX} no --llama-port provided; sigma-local provider will not be patched`
    );
  }

  // 5. Discovery server (fixed loopback port).
  let discovery: DiscoveryServer | null = null;
  try {
    discovery = await startDiscoveryServer({
      preferredPort: preferredDiscoveryPort,
      llamaPort: llamaPort > 0 ? llamaPort : null,
    });
    console.log(`${LOG_PREFIX} discovery listening on 127.0.0.1:${discovery.port}`);
  } catch (err) {
    console.warn(`${LOG_PREFIX} discovery server failed to start:`, err);
  }

  // 6. Wire up gateway lifecycle.
  const state = createLauncherState();
  const events = new EventEmitter();
  const stderrTail = createTailBuffer(24_000);

  events.on("state", (gwState: GatewayState) => {
    discovery?.update(gwState);
    const summary =
      gwState.kind === "ready"
        ? `ready ${gwState.url}`
        : gwState.kind === "failed"
          ? `failed: ${gwState.details.slice(0, 200)}`
          : `starting port=${gwState.port}`;
    console.log(`${LOG_PREFIX} gateway state: ${summary}`);
  });

  const start = createCleanGatewayStarter({
    state,
    events,
    stderrTail,
    port,
    logsDir,
    stateDir,
    configPath,
    getToken: () => token,
    url: `http://127.0.0.1:${port}/`,
    openclawDir,
    nodeBin,
    browserExecutablePath,
  });

  // 7. SIGTERM/SIGINT handler — graceful shutdown.
  let stopping = false;
  const stop = async (reason: string) => {
    if (stopping) {return;}
    stopping = true;
    state.isQuitting = true;
    console.log(`${LOG_PREFIX} stopping (${reason})`);
    try {
      await stopGatewayChild(state, getPlatform());
    } catch (err) {
      console.warn(`${LOG_PREFIX} stopGatewayChild failed:`, err);
    }
    try {
      removeGatewayPid(stateDir);
      removeGatewayInfoFile();
    } catch {
      // best effort
    }
    try {
      await discovery?.close();
    } catch {
      // best effort
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
  process.on("SIGHUP", () => void stop("SIGHUP"));

  // 8. Launch Gateway.
  try {
    await start();
  } catch (err) {
    console.error(`${LOG_PREFIX} starter threw:`, err);
    await stop("start-failed");
  }
}

function requireArg(value: string | undefined, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    console.error(`${LOG_PREFIX} missing required argument ${name}`);
    process.exit(2);
  }
  return value;
}

function parseIntOr(value: string | undefined, fallback: number): number {
  if (typeof value !== "string") {return fallback;}
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function printHelp(): void {
  process.stdout.write(
    [
      "Usage: openclaw-launcher [options]",
      "",
      "  --state-dir=PATH          Directory for openclaw.json, PID, logs (required)",
      "  --openclaw-dir=PATH       Directory containing openclaw.mjs (required)",
      "  --node-bin=PATH           Node binary to exec (default: process.execPath)",
      "  --llama-port=N            Port of the C++-managed llama-server (optional)",
      "  --browser-path=PATH       Sigma browser executable (for browser-tool)",
      "  --gateway-port=N          Preferred Gateway port (default 10500)",
      "  --discovery-port=N        Discovery HTTP port (default 19999)",
      "  --help                    Print this help and exit",
      "",
    ].join(os.EOL)
  );
}

/** Append all stdout/stderr into a rotating file for post-mortem diagnostics. */
function mirrorStdoutToFile(logPath: string): void {
  try {
    ensureDir(path.dirname(logPath));
    const stream = fs.createWriteStream(logPath, { flags: "a" });
    const tap = (channel: NodeJS.WriteStream) => {
      const original = channel.write.bind(channel) as (
        ...args: unknown[]
      ) => boolean;
      const wrapped = (...args: unknown[]): boolean => {
        const first = args[0];
        if (typeof first === "string" || first instanceof Uint8Array) {
          try {
            stream.write(first);
          } catch {
            // ignore log write failures
          }
        }
        return original(...args);
      };
      (channel as unknown as { write: (...args: unknown[]) => boolean }).write = wrapped;
    };
    tap(process.stdout);
    tap(process.stderr);
  } catch (err) {
    console.warn(`${LOG_PREFIX} mirrorStdoutToFile failed:`, err);
  }
}

void main().catch((err) => {
  console.error(`${LOG_PREFIX} fatal:`, err);
  process.exit(1);
});
