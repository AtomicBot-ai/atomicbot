#!/usr/bin/env node
/**
 * Sigma Browser Host: headless launcher for the Hermes Agent sidecar.
 *
 * Spawned by the C++ SigmaHermesManager whenever the user picks Hermes as
 * the active agent in Settings (or on first install). Job:
 *
 *   1. Verify the Hermes Pack is installed at <pack-dir>.
 *   2. Bring up the two-sided CDP bridge (Side A: CDP-mock for Hermes,
 *      Side B: relay for the extension's CdpRelayClient).
 *   3. Render <state-dir>/config.yaml with the bound ports + active model.
 *   4. Spawn the Python Hermes Agent process under the bundled CPython.
 *   5. Expose discovery at 127.0.0.1:19998/hermes-status (extension polls).
 *   6. SIGTERM/SIGINT: graceful shutdown of all of the above.
 *
 * Mirrors the OpenClaw launcher (src/launcher.ts) in shape so a single
 * agent-discovery-client in the extension can poll both endpoints.
 */
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { parseArgs } from "node:util";

import { writeCwdGuardSync } from "./cwd-guard";
import { writeHermesConfig } from "./hermes/config";
import { startHermesDiscoveryServer, type HermesDiscoveryServer } from "./hermes/discovery";
import { startHermesRelayServer, type HermesRelayServer } from "./hermes/relay-server";
import {
  isHermesPackInstalled,
  readHermesPackManifest,
  spawnHermesChild,
  type HermesChildHandles,
} from "./hermes/spawn";
import type { HermesState } from "./hermes/types";

const DEFAULT_RELAY_PORT = 19897;
const DEFAULT_DISCOVERY_PORT = 19998;
// Preferred RPC port for sigma_hermes_shim. We deliberately stay outside
// OpenClaw's pool (10500/10502/10503) so a happy-path install lets `curl
// 127.0.0.1:10602/` debug the shim without inspecting discovery first.
// If the preferred port is busy (e.g. another Hermes instance, or OpenClaw
// expanding its pool), `pickFreePort` falls back to an OS-picked ephemeral
// port and we publish that via discovery — extension always learns the
// real URL through `hermesRpcUrl`, so users never need to know the port.
const DEFAULT_HERMES_RPC_PORT = 10602;
const LOG_PREFIX = "[hermes-launcher]";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "pack-dir": { type: "string" },
      "state-dir": { type: "string" },
      "llama-port": { type: "string" },
      "model-id": { type: "string" },
      "relay-port": { type: "string", default: String(DEFAULT_RELAY_PORT) },
      "discovery-port": { type: "string", default: String(DEFAULT_DISCOVERY_PORT) },
      "hermes-rpc-port": { type: "string", default: String(DEFAULT_HERMES_RPC_PORT) },
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

  const packDir = requireArg(values["pack-dir"], "--pack-dir");
  const stateDir = requireArg(values["state-dir"], "--state-dir");
  const llamaPort = parseIntOr(values["llama-port"], 0);
  const modelId = values["model-id"];
  const preferredRelayPort = parseIntOr(values["relay-port"], DEFAULT_RELAY_PORT);
  const preferredDiscoveryPort = parseIntOr(values["discovery-port"], DEFAULT_DISCOVERY_PORT);
  const preferredHermesRpcPort = parseIntOr(
    values["hermes-rpc-port"],
    DEFAULT_HERMES_RPC_PORT,
  );

  // Cloud routing config. API key comes from env to avoid leaking it in `ps`.
  //
  // For provider=custom we treat the API key as optional — local
  // OpenAI-compatible servers (llama-server, LM Studio, vLLM, ollama, etc.)
  // typically run unauthenticated. The Hermes Python shim (`_chat_base_url`
  // in agent_loop.py) already skips the Authorization header when
  // SIGMA_HERMES_API_KEY is empty, so we only need to gate on baseUrl
  // being present for the custom case. All preset providers (anthropic /
  // openai / aimlapi / etc.) still require a real key.
  //
  // Mirrors the same gating in src/launcher.ts so flipping the provider
  // dropdown in Settings produces consistent behavior across Hermes and
  // the OpenClaw gateway.
  const cloudProvider = values["cloud-provider"] ?? "";
  const cloudBaseUrl = values["cloud-base-url"] ?? "";
  const cloudModel = values["cloud-model"] ?? "";
  const cloudApiKey = process.env.SIGMA_CLOUD_API_KEY ?? "";
  const isCustomProvider = cloudProvider === "custom";
  const hasCloudCreds = isCustomProvider ? cloudBaseUrl !== "" : cloudApiKey !== "";
  const isCloud = cloudProvider !== "" && cloudProvider !== "none" && hasCloudCreds;
  if (isCloud) {
    console.log(
      `${LOG_PREFIX} cloud=${cloudProvider} model=${cloudModel} base=${cloudBaseUrl}`,
    );
  }

  fs.mkdirSync(stateDir, { recursive: true });
  const logsDir = path.join(stateDir, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const launcherLog = path.join(logsDir, "hermes-launcher.log");
  mirrorStdoutToFile(launcherLog);

  // Materialise the cwd-guard preload into hermes stateDir as defense-in-
  // depth. Hermes' child is a Python process and won't honor NODE_OPTIONS,
  // so the guard isn't currently wired into the python spawn — but having
  // the file present means any future Node child spawned from here can
  // pick it up via `--require`, and the launcher process itself stays
  // symmetrical with openclaw-launcher.
  writeCwdGuardSync(stateDir);

  console.log(`${LOG_PREFIX} starting pid=${process.pid} node=${process.version}`);
  // Diagnostic: surface our own cwd + parent for postmortems (mirrors the
  // openclaw-launcher log line; helps when bug reports come without a
  // matching openclaw log to triangulate state).
  try {
    console.log(
      `${LOG_PREFIX} cwd=${process.cwd()} ppid=${process.ppid} platform=${process.platform}`,
    );
  } catch (err) {
    console.warn(`${LOG_PREFIX} process.cwd() failed at startup:`, err);
  }
  console.log(`${LOG_PREFIX} packDir=${packDir}`);
  console.log(`${LOG_PREFIX} stateDir=${stateDir}`);

  // Resolve the actual RPC port now (before discovery / config writes /
  // Python spawn) so every downstream consumer — health-check URL,
  // config.yaml, child env, discovery payload — agrees on the same number.
  // If the preferred port is busy (OpenClaw co-tenant, leftover Python from
  // a crash), we silently fall back to an ephemeral one rather than fail
  // the whole launcher: discovery publishes the chosen URL, so callers
  // don't care which integer it ended up being.
  const hermesRpcPort = await pickFreePort(preferredHermesRpcPort);
  if (hermesRpcPort !== preferredHermesRpcPort) {
    console.log(
      `${LOG_PREFIX} preferred rpc port :${preferredHermesRpcPort} busy, ` +
        `using :${hermesRpcPort} instead`,
    );
  }

  // 0. Reap any leaked previous-session launcher holding our discovery port.
  //    If the previous Sigma exited via SIGKILL/crash before SIGTERM could
  //    propagate, the old node-launcher (and its Python sigma_hermes_shim
  //    child) get reparented to PID 1 and keep listening. We'd then fail to
  //    bind :19998, the C++ supervisor would phantom-flip to "running", and
  //    the extension would talk to the zombie. Self-heal by probing the
  //    discovery URL: if a Hermes-shaped payload comes back with a foreign
  //    pid, SIGKILL it before binding.
  await reapOrphanLauncher(preferredDiscoveryPort);

  // 1. Discovery server up front so the extension can observe progress
  //    even while the pack download / spawn is in flight.
  const packInstalled = isHermesPackInstalled(packDir);
  const manifest = packInstalled ? readHermesPackManifest(packDir) : {};
  let discovery: HermesDiscoveryServer;
  try {
    discovery = await startHermesDiscoveryServer({
      preferredPort: preferredDiscoveryPort,
      initialPack: {
        installed: packInstalled,
        version: manifest.version,
        sizeBytes: manifest.sizeBytes,
      },
      llamaPort: llamaPort > 0 ? llamaPort : null,
    });
    console.log(`${LOG_PREFIX} discovery listening on 127.0.0.1:${discovery.port}`);
  } catch (err) {
    console.error(`${LOG_PREFIX} failed to bind discovery:`, err);
    process.exit(2);
  }

  // 2. SIGTERM/SIGINT handler — wired before any other resources so we
  //    always tear cleanly even if subsequent steps throw.
  let relay: HermesRelayServer | null = null;
  let child: HermesChildHandles | null = null;
  let stopping = false;
  const stop = async (reason: string) => {
    if (stopping) {return;}
    stopping = true;
    console.log(`${LOG_PREFIX} stopping (${reason})`);
    try {
      child?.stop("SIGTERM");
      // Give Python a brief moment to drain. SIGKILL fallback is the OS
      // default once the launcher itself exits, so we don't escalate here.
      await Promise.race([
        child?.exited ?? Promise.resolve(null),
        new Promise<null>((r) => setTimeout(() => r(null), 1500)),
      ]);
    } catch (err) {
      console.warn(`${LOG_PREFIX} child stop failed:`, err);
    }
    try {await relay?.close();} catch {/* best effort */}
    try {await discovery.close();} catch {/* best effort */}
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
  process.on("SIGHUP", () => void stop("SIGHUP"));

  // Parent-death watcher. If Sigma crashes, gets killed with SIGKILL, or
  // exits before its SIGTERM handler can fire, we get reparented to PID 1
  // (init / launchd) and silently keep running — holding the loopback
  // discovery (:19998) and relay (:19897) ports plus a Python child still
  // wired to the now-dead browser's llama-server port. The next Sigma
  // launch then can't bind discovery, the C++ supervisor sees a "phantom
  // running" launcher, and the extension talks to our zombie instead of
  // the freshly-spawned one — surfacing as "All connection attempts
  // failed" on the user's first chat. Detect orphaning via ppid==1 and
  // self-terminate so the next browser run gets clean ports.
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

  if (!packInstalled) {
    // Stay alive in "not_installed" state. The C++ supervisor / the
    // extension UI surfaces an Install button that triggers the pack
    // download. When the download completes the supervisor relaunches us.
    console.log(`${LOG_PREFIX} pack not installed at ${packDir}; idling.`);
    return;
  }

  // 3. Bring up the unified relay (extension on /extension, Python CDP on /cdp).
  try {
    relay = await startHermesRelayServer({
      preferredPort: preferredRelayPort,
      logPrefix: LOG_PREFIX,
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} relay failed to start:`, err);
    discovery.update({
      kind: "failed",
      relayPort: 0,
      relayToken: "",
      logsDir,
      details: String(err),
    });
    return;
  }

  const relayPort = relay.port;
  const relayToken = relay.gatewayToken;
  const relayUrl = `${relay.baseWsUrl}/extension`;
  const cdpUrl = relay.cdpWsUrl;

  discovery.update({
    kind: "starting",
    relayPort,
    relayToken,
    logsDir,
  } satisfies HermesState);

  // 4. Render config.yaml from the live ports.
  const configPath = path.join(stateDir, "config.yaml");
  try {
    writeHermesConfig({
      configPath,
      inputs: {
        llamaPort,
        cdpUrl,
        hermesRpcPort,
        modelId,
        stateDir,
      },
    });
    console.log(`${LOG_PREFIX} wrote config -> ${configPath}`);
  } catch (err) {
    console.error(`${LOG_PREFIX} failed to write hermes config:`, err);
    discovery.update({
      kind: "failed",
      relayPort,
      relayToken,
      logsDir,
      details: `config write failed: ${String(err)}`,
    });
    return;
  }

  // 5. Spawn Python Hermes.
  try {
    const cloudExtraEnv: Record<string, string> = {};
    if (isCloud) {
      cloudExtraEnv.SIGMA_HERMES_PROVIDER = cloudProvider;
      cloudExtraEnv.SIGMA_HERMES_BASE_URL = cloudBaseUrl;
      cloudExtraEnv.SIGMA_HERMES_MODEL = cloudModel;
      cloudExtraEnv.SIGMA_HERMES_API_KEY = cloudApiKey;
    }
    child = spawnHermesChild({
      paths: { packDir, stateDir, configPath },
      config: {
        hermesRpcPort,
        llamaPort,
        modelId,
        cdpWsUrl: cdpUrl,
      },
      extraEnv: cloudExtraEnv,
    });
    console.log(`${LOG_PREFIX} spawned hermes child pid=${child.process.pid}`);
  } catch (err) {
    console.error(`${LOG_PREFIX} failed to spawn hermes:`, err);
    discovery.update({
      kind: "failed",
      relayPort,
      relayToken,
      logsDir,
      details: `spawn failed: ${String(err)}`,
    });
    return;
  }

  // 6. Healthcheck the Hermes JSON-RPC port. We poll instead of trusting the
  //    child stdout log because Hermes' boot time varies with model loading
  //    on the first request — a fixed sleep is too racy.
  const becameReady = await waitForRpcReady({
    port: hermesRpcPort,
    timeoutMs: 30_000,
    intervalMs: 500,
  });
  if (!becameReady) {
    discovery.update({
      kind: "failed",
      relayPort,
      relayToken,
      logsDir,
      details: `hermes rpc never came up on 127.0.0.1:${hermesRpcPort}`,
    });
    console.warn(`${LOG_PREFIX} hermes rpc never became ready`);
    return;
  }

  discovery.update({
    kind: "ready",
    relayPort,
    relayUrl,
    relayToken,
    cdpMockPort: relayPort,
    cdpMockToken: relayToken,
    hermesRpcPort,
    logsDir,
  });
  discovery.setHermesRpcUrl(`http://127.0.0.1:${hermesRpcPort}/`);
  console.log(`${LOG_PREFIX} ready (relay=${relayUrl}, rpc=:${hermesRpcPort})`);

  // 7. If the child exits unexpectedly, mark failed so the UI surfaces it.
  void child.exited.then((code) => {
    if (stopping) {return;}
    discovery.update({
      kind: "failed",
      relayPort,
      relayToken,
      logsDir,
      details: `hermes exited with code=${code}`,
    });
    console.warn(`${LOG_PREFIX} hermes exited code=${code}`);
  });
}

/**
 * Detect and SIGKILL a leaked previous-session hermes-launcher that's still
 * holding the discovery port. The probe is shaped to be safe in three ways:
 *
 *   - We only kill if /hermes-status responds AND the JSON has the launcher's
 *     `pid` field — anything else (curl, an unrelated process bound to the
 *     same port) gets left alone.
 *   - We never kill our own pid (defensive against weird supervisor races
 *     that re-launch us in the same process group).
 *   - Total timeout is bounded (~1.5s) so a stuck probe can never wedge boot.
 *
 * Returning a free port is best-effort: if SIGKILL fails (permission denied,
 * pid already gone, kernel slow to release the socket) the subsequent
 * discovery bind retries 6×250ms anyway.
 */
async function reapOrphanLauncher(discoveryPort: number): Promise<void> {
  const url = `http://127.0.0.1:${discoveryPort}/hermes-status`;
  let payload: { pid?: unknown } | null = null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(750) });
    if (!res.ok) {return;}
    payload = (await res.json()) as { pid?: unknown };
  } catch {
    // No one listening (good) or non-Hermes process (we don't touch it).
    return;
  }
  const orphanPid =
    typeof payload?.pid === "number" && Number.isInteger(payload.pid) ? payload.pid : 0;
  if (orphanPid <= 0 || orphanPid === process.pid) {return;}

  console.warn(
    `${LOG_PREFIX} found orphan launcher pid=${orphanPid} on :${discoveryPort}, killing`,
  );
  try {
    process.kill(orphanPid, "SIGKILL");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | null)?.code;
    if (code !== "ESRCH") {
      console.warn(`${LOG_PREFIX} kill orphan ${orphanPid} failed:`, err);
    }
    return;
  }

  // Wait up to ~750ms for the kernel to release the listening socket.
  // SIGKILL is synchronous to the process but TCP sockets can linger briefly.
  const deadline = Date.now() + 750;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(150) });
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function waitForRpcReady(params: {
  port: number;
  timeoutMs: number;
  intervalMs: number;
}): Promise<boolean> {
  const deadline = Date.now() + params.timeoutMs;
  const url = `http://127.0.0.1:${params.port}/healthz`;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, {signal: AbortSignal.timeout(1000)});
      if (res.ok) {return true;}
    } catch {
      // Not up yet — keep polling.
    }
    await new Promise((r) => setTimeout(r, params.intervalMs));
  }
  return false;
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

/**
 * Pick a free loopback TCP port, preferring `preferred` when possible.
 *
 * Mirrors the C++ TryBindLoopbackPort pattern in sigma_llama_server_manager.cc:
 * try the well-known number first (gives users a stable curl target on a happy
 * path) and fall back to OS-picked ephemeral if it's taken. Same TOCTOU
 * caveat — the chosen port is "free right now", another process could grab
 * it before our consumer (sigma_hermes_shim) calls bind(). In practice the
 * collision space is just OpenClaw's pool and stale Hermes children, both
 * stable, so this is not worth a port-grab handshake.
 *
 * Pass preferred=0 to skip straight to ephemeral.
 */
async function pickFreePort(preferred: number): Promise<number> {
  const tryBind = (port: number): Promise<number> =>
    new Promise<number>((resolve, reject) => {
      const sock = net.createServer();
      const onError = (err: NodeJS.ErrnoException) => {
        sock.removeListener("listening", onListening);
        reject(err);
      };
      const onListening = () => {
        sock.removeListener("error", onError);
        const addr = sock.address();
        const bound = addr && typeof addr !== "string" ? addr.port : 0;
        sock.close(() => {
          if (bound > 0) {resolve(bound);}
          else {reject(new Error("failed to resolve bound port"));}
        });
      };
      sock.once("error", onError);
      sock.once("listening", onListening);
      sock.listen(port, "127.0.0.1");
    });

  if (preferred > 0) {
    try {
      return await tryBind(preferred);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | null)?.code;
      if (code !== "EADDRINUSE") {throw err;}
      // fall through to ephemeral
    }
  }
  return tryBind(0);
}

function printHelp(): void {
  process.stdout.write(
    [
      "Usage: hermes-launcher [options]",
      "",
      "  --pack-dir=PATH        Hermes pack root (CPython + hermes_agent) (required)",
      "  --state-dir=PATH       Per-profile state dir for config.yaml/logs (required)",
      "  --llama-port=N         Active sigma llama-server port (optional)",
      "  --model-id=ID          Active model id from sigma prefs (optional)",
      "  --relay-port=N         Preferred Side B relay port (default 19897)",
      "  --discovery-port=N     Discovery HTTP port (default 19998)",
      "  --hermes-rpc-port=N    Preferred JSON-RPC port for the Hermes child",
      "                         (default 10602; falls back to ephemeral if busy)",
      "  --cloud-provider=NAME  Cloud LLM provider: 'anthropic' or empty/none",
      "  --cloud-base-url=URL   Base URL for cloud provider (e.g. https://api.anthropic.com/v1/)",
      "  --cloud-model=ID       Cloud model ID (e.g. claude-sonnet-4-5-20250929)",
      "  (env) SIGMA_CLOUD_API_KEY  API key for the cloud provider",
      "  --help                 Print this help and exit",
      "",
    ].join(os.EOL),
  );
}

function mirrorStdoutToFile(logPath: string): void {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const stream = fs.createWriteStream(logPath, { flags: "a" });
    const tap = (channel: NodeJS.WriteStream) => {
      const original = channel.write.bind(channel) as (...args: unknown[]) => boolean;
      const wrapped = (...args: unknown[]): boolean => {
        const first = args[0];
        if (typeof first === "string" || first instanceof Uint8Array) {
          try {stream.write(first);} catch {/* ignore log write failures */}
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
