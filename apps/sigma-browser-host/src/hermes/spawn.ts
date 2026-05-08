import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

// Verbose tracing is opt-in via env var so release builds stay quiet on
// stdout/stderr. Set SIGMA_LAUNCHER_VERBOSE=1 to re-enable per-step
// pre-spawn diagnostics (xattr/codesign/PYTHONPATH/cwd).
const VERBOSE =
  process.env.SIGMA_LAUNCHER_VERBOSE === "1" ||
  process.env.SIGMA_LAUNCHER_VERBOSE === "true";

function verbose(...args: unknown[]): void {
  if (VERBOSE) {console.log(...args);}
}

/**
 * Pre-spawn macOS sanity-fixups.  Strips any quarantine xattr that survived
 * the C++ downloader's pass (we've seen Gatekeeper re-stamp it after the
 * downloader finishes), and logs the codesign / xattr state so a SIGKILL
 * from the kernel security policy is at least diagnosable.  Best-effort —
 * any failure here is just logged, never fatal.
 */
function macosPreSpawnFixup(packDir: string): void {
  if (process.platform !== "darwin") {
    return;
  }
  try {
    const xattrCheck = spawnSync("xattr", ["-l", path.join(packDir, "python", "bin", "python3.11")], {
      encoding: "utf8",
    });
    const beforeOut = (xattrCheck.stdout ?? "") + (xattrCheck.stderr ?? "");
    const wasQuarantined = /com\.apple\.quarantine/.test(beforeOut);
    verbose(
      `[hermes-spawn] pre-spawn xattr (python3.11): ${beforeOut.trim() || "<none>"}`,
    );
    if (wasQuarantined) {
      console.warn(
        `[hermes-spawn] python3.11 has com.apple.quarantine — Gatekeeper will SIGKILL it.  Stripping recursively from packDir.`,
      );
      const strip = spawnSync("xattr", ["-dr", "com.apple.quarantine", packDir], {
        encoding: "utf8",
      });
      if (strip.status !== 0) {
        console.warn(
          `[hermes-spawn] xattr -dr failed code=${strip.status} stderr=${strip.stderr}`,
        );
      } else {
        verbose(`[hermes-spawn] stripped com.apple.quarantine from ${packDir}`);
      }
    }
    const codesignCheck = spawnSync(
      "codesign",
      ["-dvvv", path.join(packDir, "python", "bin", "python3.11")],
      { encoding: "utf8" },
    );
    const csOut = ((codesignCheck.stdout ?? "") + (codesignCheck.stderr ?? "")).trim();
    const flagsLine = csOut.split("\n").find((l) => l.includes("flags=")) ?? "<no flags>";
    verbose(`[hermes-spawn] pre-spawn codesign (python3.11): ${flagsLine}`);
  } catch (err) {
    console.warn(`[hermes-spawn] pre-spawn fixup failed: ${err}`);
  }
}

/**
 * Spawn the Python Hermes Agent process from the bundled CPython pack.
 *
 * Layout we expect inside the pack dir (built by tools/build-hermes-pack):
 *
 *   <pack>/python/bin/python                 (CPython 3.11, code-signed)
 *   <pack>/python/lib/python3.11/site-packages/hermes_agent/...
 *   <pack>/manifest.json                     ({ version, hermesVersion, ... })
 *
 * We invoke Hermes via the `gateway` CLI mode with our generated config.
 * The gateway mode is what Hermes uses for embedded / sidecar deployments;
 * it exposes a JSON-RPC chat API on the configured rpc.port.
 */

export interface HermesChildHandles {
  readonly process: ChildProcess;
  readonly logFile: string;
  /** Resolves with the exit code; resolves with null on signal termination. */
  readonly exited: Promise<number | null>;
  stop(signal: NodeJS.Signals): void;
}

export interface HermesPackPaths {
  /** Root of the installed Hermes pack (e.g. `<profile>/SigmaAgents/hermes`). */
  packDir: string;
  /** Per-launcher state dir. Hermes writes logs / sqlite / scratch here. */
  stateDir: string;
  /** Path to the rendered config.yaml. */
  configPath: string;
}

export interface HermesSpawnConfig {
  /** Port the Python child should bind its JSON-RPC server to. */
  hermesRpcPort: number;
  /** Port of the active sigma llama-server (BYO model). 0 if unknown. */
  llamaPort: number;
  /** Optional model id to pass through to llama-server. */
  modelId?: string;
  /**
   * ws:// URL the Python shim's browser_relay should connect to (the
   * `/cdp?token=…` endpoint exposed by the Hermes relay server). The shim
   * uses this to issue browser-control CDP commands during tool calls.
   */
  cdpWsUrl?: string;
}

export function isHermesPackInstalled(packDir: string): boolean {
  try {
    const manifestPath = path.join(packDir, "manifest.json");
    const pythonBin = path.join(packDir, "python", "bin", "python");
    return fs.statSync(manifestPath).isFile() && fs.statSync(pythonBin).isFile();
  } catch {
    return false;
  }
}

export function readHermesPackManifest(packDir: string): {
  version?: string;
  hermesVersion?: string;
  sizeBytes?: number;
} {
  try {
    const raw = fs.readFileSync(path.join(packDir, "manifest.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      version: typeof parsed.version === "string" ? parsed.version : undefined,
      hermesVersion:
        typeof parsed.hermesVersion === "string" ? parsed.hermesVersion : undefined,
      sizeBytes: typeof parsed.sizeBytes === "number" ? parsed.sizeBytes : undefined,
    };
  } catch {
    return {};
  }
}

export function spawnHermesChild(params: {
  paths: HermesPackPaths;
  /** Ports / model id consumed by the bundled sigma_hermes_shim server. */
  config: HermesSpawnConfig;
  /** Extra env to merge into the child env. */
  extraEnv?: Record<string, string>;
  /** Optional explicit log file (default: <stateDir>/logs/hermes.log). */
  logFile?: string;
}): HermesChildHandles {
  const { paths, config, extraEnv } = params;
  const pythonBin = path.join(paths.packDir, "python", "bin", "python");
  if (!fs.existsSync(pythonBin)) {
    throw new Error(`hermes pack not installed: missing ${pythonBin}`);
  }
  macosPreSpawnFixup(paths.packDir);
  const logsDir = path.join(paths.stateDir, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const logFile = params.logFile ?? path.join(logsDir, "hermes.log");
  const logStream = fs.openSync(logFile, "a");

  const env: Record<string, string> = {
    ...process.env,
    ...extraEnv,
    // Pin the Python module search path to the bundled site-packages so a
    // user's global Python install can never shadow our code.
    PYTHONPATH: path.join(paths.packDir, "python", "lib", "python3.11", "site-packages"),
    // Hermes reads HERMES_CONFIG by convention; we still set it for the
    // (eventual) full Hermes loop, even though the Phase 1 shim doesn't.
    HERMES_CONFIG: paths.configPath,
    // sigma_hermes_shim.server reads these to know where to bind and which
    // llama-server to proxy to.
    SIGMA_HERMES_RPC_PORT: String(config.hermesRpcPort),
    SIGMA_LLAMA_PORT: String(config.llamaPort > 0 ? config.llamaPort : 8787),
    SIGMA_HERMES_LOGS_DIR: logsDir,
    // Pre-emptively disable color codes — we mirror stdout/stderr to a flat
    // log file and cleanliness > styling for postmortems.
    NO_COLOR: "1",
  };
  if (config.modelId && config.modelId.trim().length > 0) {
    env.SIGMA_LLAMA_MODEL = config.modelId.trim();
  }
  if (config.cdpWsUrl && config.cdpWsUrl.trim().length > 0) {
    // sigma_hermes_shim.server reads this to know where to send browser-tool
    // CDP commands during tool calls. Empty/unset disables browser tools.
    env.SIGMA_HERMES_CDP_URL = config.cdpWsUrl.trim();
  }

  // Phase 1: launch our thin sigma_hermes_shim server, NOT
  // `hermes_cli.main gateway run`. Reasoning:
  //   - `hermes-agent` (v0.12.x) ships several entry points but none of
  //     them expose an HTTP/JSON-RPC chat API out of the box. The two
  //     plausible candidates were:
  //       * `hermes gateway run` — a messaging-platform daemon
  //         (Telegram/Discord bridges + cron). Wrong shape: no HTTP
  //         endpoint, expects platform allowlists, idles on cron.
  //       * `hermes-acp` — a stdio-based ACP server. Right semantics
  //         but wrong transport: extension talks HTTP+SSE, not stdio.
  //   - Wrapping either in a real adapter is a significant project on
  //     its own and was blocking the rest of the pipeline (download,
  //     code-sign, supervise, discovery) from being exercised E2E.
  //   - The shim we ship in the pack (`sigma_hermes_shim.server`)
  //     binds 127.0.0.1:$SIGMA_HERMES_RPC_PORT, speaks the exact
  //     JSON-RPC + SSE wire format that HermesChatProvider already
  //     expects, and proxies completions to the local llama-server
  //     ("BYO model"). Swapping its body for the real `agent.AIAgent`
  //     loop is the next focused change without touching the
  //     extension or launcher.
  //
  // We deliberately avoid invoking wrapper scripts under `<pack>/bin/`
  // (e.g. `bin/hermes`) because pip bakes an absolute shebang at
  // install time, pinning the path to the build-machine layout (e.g.
  // the GitHub Actions runner). `-m sigma_hermes_shim.server` runs
  // through *our* `pythonBin`, so the pack stays relocatable across
  // user machines without a post-install fixup.
  const args = ["-m", "sigma_hermes_shim.server"];
  verbose(
    `[hermes-spawn] launching python: ${pythonBin} ${args.join(" ")}`,
  );
  verbose(`[hermes-spawn] PYTHONPATH=${env.PYTHONPATH}`);
  verbose(`[hermes-spawn] HERMES_CONFIG=${env.HERMES_CONFIG}`);
  verbose(`[hermes-spawn] cwd=${paths.packDir}`);
  verbose(`[hermes-spawn] child stdout/stderr → ${logFile}`);
  const child = spawn(pythonBin, args, {
    cwd: paths.packDir,
    env,
    stdio: ["ignore", logStream, logStream],
    detached: false,
  });
  child.once("error", (err) => {
    console.warn(`[hermes-spawn] failed to spawn python: ${err}`);
  });
  child.once("exit", (code, signal) => {
    let tail = "";
    try {
      const stat = fs.statSync(logFile);
      const fd = fs.openSync(logFile, "r");
      const readLen = Math.min(stat.size, 4096);
      const buf = Buffer.alloc(readLen);
      fs.readSync(fd, buf, 0, readLen, Math.max(0, stat.size - readLen));
      fs.closeSync(fd);
      tail = buf.toString("utf8").trim();
    } catch (err) {
      tail = `<could not read ${logFile}: ${err}>`;
    }
    const reason =
      signal === "SIGKILL"
        ? " (SIGKILL — likely macOS Gatekeeper quarantine; check `xattr -l <python>` and code signature)"
        : "";
    console.log(
      `[hermes-spawn] python exited code=${code} signal=${signal}${reason}`,
    );
    if (tail.length === 0) {
      console.log(
        `[hermes-spawn] hermes.log is empty — child was killed before any output. ` +
          `On macOS this is almost always Gatekeeper / unsigned-library policy.`,
      );
    } else {
      const tailLines = tail.split("\n").slice(-20).join("\n");
      console.log(`[hermes-spawn] last lines of ${logFile}:\n${tailLines}`);
    }
  });

  const exited = new Promise<number | null>((resolve) => {
    child.once("exit", (code) => resolve(code));
  });

  void exited.finally(() => {
    try {
      fs.closeSync(logStream);
    } catch {
      // ignore — log file already closed
    }
  });

  return {
    process: child,
    logFile,
    exited,
    stop(signal) {
      try {
        if (!child.killed) {child.kill(signal);}
      } catch (err) {
        console.warn(`[hermes-spawn] kill(${signal}) failed:`, err);
      }
    },
  };
}
