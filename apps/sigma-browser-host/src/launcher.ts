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
  killOrphanedLauncher,
  removeGatewayPid,
  removeLauncherPid,
  removeStaleGatewayLock,
  writeLauncherPid,
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
import { writeCwdGuardSync } from "./cwd-guard";
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
      "cloud-provider": { type: "string" },
      "cloud-base-url": { type: "string" },
      "cloud-model": { type: "string" },
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

  // Cloud routing config (passed via CLI; API key comes from env).
  const cloudProvider = values["cloud-provider"] ?? "";
  const cloudBaseUrl = values["cloud-base-url"] ?? "";
  const cloudModelId = values["cloud-model"] ?? "";
  const cloudApiKey = process.env.SIGMA_CLOUD_API_KEY ?? "";
  const isCloud = cloudProvider !== "" && cloudProvider !== "none" && cloudApiKey !== "";
  if (isCloud) {
    console.log(
      `${LOG_PREFIX} cloud=${cloudProvider} model=${cloudModelId} base=${cloudBaseUrl}`,
    );
  }

  ensureDir(stateDir);
  const configPath = path.join(stateDir, "openclaw.json");
  const logsDir = path.join(stateDir, "logs");
  ensureDir(logsDir);

  // Materialise the cwd-guard preload into stateDir so any node child we
  // spawn (or accidentally re-exec) can be launched with NODE_OPTIONS=
  // `--require <cwdGuardPath>` to recover from uv_cwd ENOENT crashes.
  // See cwd-guard.ts for rationale.
  const cwdGuardPath = writeCwdGuardSync(stateDir);

  const launcherLogPath = path.join(logsDir, "launcher.log");
  mirrorStdoutToFile(launcherLogPath);

  console.log(`${LOG_PREFIX} starting pid=${process.pid} node=${process.version}`);
  // Diagnostic: surface our own cwd + parent so we can spot future "phantom
  // launcher" scenarios (stale process from a previous Sigma install holding
  // the discovery port, mismatched ppid after parent crash, etc.).
  try {
    console.log(
      `${LOG_PREFIX} cwd=${process.cwd()} ppid=${process.ppid} platform=${process.platform}`
    );
  } catch (err) {
    console.warn(`${LOG_PREFIX} process.cwd() failed at startup:`, err);
  }
  console.log(`${LOG_PREFIX} stateDir=${stateDir}`);
  console.log(`${LOG_PREFIX} openclawDir=${openclawDir}`);
  console.log(`${LOG_PREFIX} nodeBin=${nodeBin}`);

  // 1. Orphan cleanup.
  //
  // Three layers:
  //   a) a previous *launcher* process (this binary) may still be alive and
  //      holding the discovery port (19999). If we don't kill it, `listen`
  //      below fails with EADDRINUSE and the extension can never discover
  //      the new gateway. See sigma/browser/gateway/README.md.
  //   b) the gateway *child* (openclaw.mjs) is tracked separately via its
  //      own PID file, because (a) kills the launcher tree which normally
  //      takes the gateway with it, but a crashed launcher may leak the
  //      child too.
  //   c) PID-file based detection misses orphans whose PID-file is gone
  //      (e.g. a previous Sigma install in /Applications/Sigma.app removed
  //      its launcher.pid on graceful shutdown signal but the process survived
  //      because Sparkle replaced the bundle mid-shutdown). Probe :19999
  //      directly — if a launcher-shaped /gateway-status responds with a
  //      foreign pid, SIGKILL it. Mirrors hermes-launcher's reapOrphanLauncher.
  try {
    const killedLauncherPid = killOrphanedLauncher(stateDir);
    if (killedLauncherPid != null) {
      console.log(
        `${LOG_PREFIX} killed orphan launcher pid=${killedLauncherPid} (via PID-file)`
      );
    }
    const killedPid = killOrphanedGateway(stateDir);
    if (killedPid != null) {
      console.log(`${LOG_PREFIX} killed orphan gateway pid=${killedPid}`);
    }
    removeStaleGatewayLock(configPath);
  } catch (err) {
    console.warn(`${LOG_PREFIX} orphan cleanup failed:`, err);
  }

  // 1c. Port-based orphan reap (independent of PID-file).
  const reapedByPort = await reapOrphanLauncherByPort(preferredDiscoveryPort);
  console.log(
    `${LOG_PREFIX} orphan-reap port=${preferredDiscoveryPort} pid=${
      reapedByPort ?? "none"
    }`,
  );

  // Record our own PID so the *next* launcher can detect us if we die
  // uncleanly.
  writeLauncherPid(stateDir, process.pid);

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

  // 4. Patch sigma-local provider with the current llama-server port + keep
  //    profiles.user.cdpUrl in sync with the derived extension-relay port.
  //    Run even without --llama-port so the browser-profile half still executes
  //    (e.g. cloud-model setups where the extension still needs the relay).
  const llamaPort = llamaPortArg ? parseIntOr(llamaPortArg, 0) : 0;
  await patchSigmaLocalProvider({
    configPath,
    llamaPort,
    gatewayPort: port,
    cloudProvider: isCloud ? cloudProvider : undefined,
    cloudApiKey: isCloud ? cloudApiKey : undefined,
    cloudModelId: isCloud ? cloudModelId : undefined,
    cloudBaseUrl: isCloud ? cloudBaseUrl : undefined,
  });
  console.log(
    `${LOG_PREFIX} sigma-local config patched -> llamaPort=${llamaPort} gatewayPort=${port}`
  );

  // 5. Discovery server (fixed loopback port).
  let discovery: DiscoveryServer | null = null;
  try {
    discovery = await startDiscoveryServer({
      preferredPort: preferredDiscoveryPort,
      llamaPort: llamaPort > 0 ? llamaPort : null,
    });
    console.log(`${LOG_PREFIX} discovery listening on 127.0.0.1:${discovery.port}`);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | null)?.code;
    if (code === "EADDRINUSE") {
      // The reaper above failed to clear the port (foreign process not
      // matching our /gateway-status shape, or unkillable). The extension
      // will still hit 127.0.0.1:19999 — which means it's about to talk to
      // that foreign process, not us. Surface loudly so the next bug report
      // has the smoking gun in the log.
      console.error(
        `${LOG_PREFIX} WARNING: discovery port :${preferredDiscoveryPort} held by FOREIGN process — extension will talk to it, NOT us. OpenClaw will be unreachable until the foreign process is killed.`,
      );
    } else {
      console.warn(`${LOG_PREFIX} discovery server failed to start:`, err);
    }
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
    cwdGuardPath,
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
    try {
      removeLauncherPid(stateDir);
    } catch {
      // best effort
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
  process.on("SIGHUP", () => void stop("SIGHUP"));

  // Parent-death watcher. Same rationale as in hermes-launcher.ts: if Sigma
  // exits without delivering SIGTERM (crash, kill -9, debug-build abort) we
  // get reparented to PID 1 and silently keep holding the loopback gateway/
  // discovery ports — the next browser launch then collides with us and the
  // extension talks to our zombie. ppid==1 means "parent died on POSIX".
  const initialPpid = process.ppid;
  if (initialPpid !== 1) {
    const watcher = setInterval(() => {
      if (stopping) {return;}
      const ppid = process.ppid;
      if (ppid === 1) {
        console.warn(
          `${LOG_PREFIX} parent process exited (ppid 1, was ${initialPpid}) — shutting down`,
        );
        clearInterval(watcher);
        void stop("parent-died");
      }
    }, 2000);
    watcher.unref();
  }

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
      "  --cloud-provider=NAME     Cloud LLM provider: 'anthropic' or empty/none",
      "  --cloud-base-url=URL      Cloud provider base URL",
      "  --cloud-model=ID          Cloud model ID",
      "  (env) SIGMA_CLOUD_API_KEY API key for the cloud provider",
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

/**
 * Detect and SIGKILL a leaked previous-session openclaw-launcher that's
 * still holding the discovery port. Independent of the PID-file (which is
 * removed on graceful shutdown signal — but the process may survive that
 * signal in odd cases like a Sparkle bundle replace mid-quit, leaving a
 * zombie that PID-file based cleanup can never find).
 *
 * Safety:
 *   - Only kills if /gateway-status responds AND the JSON has a numeric
 *     `pid` field matching our discovery payload shape. Any unrelated
 *     process on :19999 (curl, dev server, foreign sigma sibling) is left
 *     alone.
 *   - Never kills our own pid (defensive against weird race where we got
 *     reparented).
 *   - Bounded total timeout (~1.5s) so a slow probe can never wedge boot.
 *
 * Returns the PID we killed, or null if there was nothing matching.
 *
 * Mirrors hermes-launcher's reapOrphanLauncher (see hermes-launcher.ts).
 */
async function reapOrphanLauncherByPort(
  discoveryPort: number,
): Promise<number | null> {
  const url = `http://127.0.0.1:${discoveryPort}/gateway-status`;
  let payload: { pid?: unknown } | null = null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(750) });
    if (!res.ok) {return null;}
    payload = (await res.json()) as { pid?: unknown };
  } catch {
    // No one listening (good) or non-OpenClaw process (we don't touch it).
    return null;
  }
  const orphanPid =
    typeof payload?.pid === "number" && Number.isInteger(payload.pid)
      ? payload.pid
      : 0;
  if (orphanPid <= 0 || orphanPid === process.pid) {return null;}

  console.warn(
    `${LOG_PREFIX} found orphan launcher pid=${orphanPid} on :${discoveryPort}, killing (SIGKILL)`,
  );
  try {
    process.kill(orphanPid, "SIGKILL");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | null)?.code;
    if (code !== "ESRCH") {
      console.warn(`${LOG_PREFIX} kill orphan ${orphanPid} failed:`, err);
      return null;
    }
  }

  // Wait up to ~750ms for the kernel to release the listening socket.
  // SIGKILL is synchronous to the process but TCP sockets can linger
  // briefly.
  const deadline = Date.now() + 750;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(150) });
    } catch {
      return orphanPid;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  // Socket still up after 750ms — best-effort. Discovery bind retries
  // 6x250ms anyway (discovery-server.ts).
  return orphanPid;
}

void main().catch((err) => {
  console.error(`${LOG_PREFIX} fatal:`, err);
  process.exit(1);
});
