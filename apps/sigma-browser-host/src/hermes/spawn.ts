import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

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
  /** Extra env to merge into the child env. */
  extraEnv?: Record<string, string>;
  /** Optional explicit log file (default: <stateDir>/logs/hermes.log). */
  logFile?: string;
}): HermesChildHandles {
  const { paths, extraEnv } = params;
  const pythonBin = path.join(paths.packDir, "python", "bin", "python");
  if (!fs.existsSync(pythonBin)) {
    throw new Error(`hermes pack not installed: missing ${pythonBin}`);
  }
  const logsDir = path.join(paths.stateDir, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const logFile = params.logFile ?? path.join(logsDir, "hermes.log");
  const logStream = fs.openSync(logFile, "a");

  const env = {
    ...process.env,
    ...extraEnv,
    // Pin the Python module search path to the bundled site-packages so a
    // user's global Python install can never shadow our code.
    PYTHONPATH: path.join(paths.packDir, "python", "lib", "python3.11", "site-packages"),
    // Hermes reads HERMES_CONFIG by convention; CLI flag is also passed below
    // for explicitness.
    HERMES_CONFIG: paths.configPath,
    // Pre-emptively disable color codes — we mirror stdout/stderr to a flat
    // log file and cleanliness > styling for postmortems.
    NO_COLOR: "1",
  };

  // `python -m hermes_agent gateway --config <path>` is the canonical CLI
  // entry for embedded sidecar usage. Adjust if upstream renames it.
  const child = spawn(
    pythonBin,
    ["-m", "hermes_agent", "gateway", "--config", paths.configPath],
    {
      cwd: paths.packDir,
      env,
      stdio: ["ignore", logStream, logStream],
      detached: false,
    },
  );

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
