import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { ensureDir } from "@electron-main/util/fs";
import { getPlatform } from "@electron-main/platform";
import type { TailBuffer } from "@electron-main/util/net";

import { buildNodeOptionsWithGuard } from "./cwd-guard";

const SPAWN_LOG_PREFIX = "[gateway-spawn]";

/**
 * Clean fork of apps/electron-desktop/src/main/gateway/spawn.ts:
 *   - no whisper/ffmpeg dependencies (those live in Electron bundle only)
 *   - no optional bundled binaries (gh, jq, memo, ...) — host PATH is used instead
 *   - no `electronRunAsNode` branch (we always spawn a real node binary)
 *
 * Everything else (args, env, stdio, stderr tail) mirrors the Electron variant
 * so the Gateway starts identically.
 */
export function spawnGatewayClean(params: {
  port: number;
  logsDir: string;
  stateDir: string;
  configPath: string;
  token: string;
  openclawDir: string;
  nodeBin: string;
  browserExecutablePath?: string;
  /** Absolute path to <stateDir>/cwd-guard.cjs (see cwd-guard.ts). */
  cwdGuardPath?: string;
  stderrTail: TailBuffer;
}): ChildProcess {
  const {
    port,
    logsDir,
    stateDir,
    configPath,
    token,
    openclawDir,
    nodeBin,
    browserExecutablePath,
    cwdGuardPath,
    stderrTail,
  } = params;

  ensureDir(logsDir);
  ensureDir(stateDir);

  const stdoutPath = path.join(logsDir, "gateway.stdout.log");
  const stderrPath = path.join(logsDir, "gateway.stderr.log");
  const stdout = fs.createWriteStream(stdoutPath, { flags: "a" });
  const stderr = fs.createWriteStream(stderrPath, { flags: "a" });

  const script = path.join(openclawDir, "openclaw.mjs");
  const args = [
    // Node 22.x exposes `node:sqlite` behind this flag in some builds.
    "--experimental-sqlite",
    script,
    "gateway",
    "--bind",
    "loopback",
    "--port",
    String(port),
    "--allow-unconfigured",
    "--verbose",
    ...getPlatform().gatewaySpawnOptions().extraArgs,
  ];

  const ghConfigDir = path.join(stateDir, "gh");
  ensureDir(ghConfigDir);

  // Defense-in-depth against uv_cwd ENOENT (see cwd-guard.ts): preload a
  // tiny CommonJS guard that proactively chdir's into OPENCLAW_STATE_DIR
  // and wraps `process.cwd` to self-heal if libuv ever surfaces an
  // ENOENT/uv_cwd. The path lives next to stateDir so it always exists
  // even if the .app bundle gets swapped out.
  const nodeOptionsWithGuard = cwdGuardPath
    ? buildNodeOptionsWithGuard(cwdGuardPath, process.env.NODE_OPTIONS)
    : process.env.NODE_OPTIONS;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: configPath,
    OPENCLAW_GATEWAY_PORT: String(port),
    OPENCLAW_GATEWAY_TOKEN: token,
    GH_CONFIG_DIR: ghConfigDir,
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    // Prevent self-restart via SIGUSR1 — keeps the same PID so the C++
    // supervisor can always kill the gateway on quit.
    OPENCLAW_NO_RESPAWN: "1",
    ...(nodeOptionsWithGuard ? { NODE_OPTIONS: nodeOptionsWithGuard } : {}),
    // Point browser-tool at the running Sigma binary (resolved by the C++
    // supervisor from base::FILE_EXE, so it works in both dev and packaged runs).
    ...(browserExecutablePath
      ? { OPENCLAW_BROWSER_EXECUTABLE_PATH: browserExecutablePath }
      : {}),
  };

  // IMPORTANT — do NOT use `openclawDir` as cwd here.
  //
  // In release builds `openclawDir` resolves to
  //   Sigma.app/Contents/Frameworks/Sigma Framework.framework/Versions/<ver>/
  //     Resources/openclaw
  // (passed as `--openclaw-dir` from the C++ supervisor). Sparkle auto-updates
  // replace the entire .app bundle while the launcher is still running, so
  // that path either:
  //   * disappears before this `spawn` is even reached (synchronous ENOENT
  //     during `posix_spawn` chdir), or
  //   * disappears mid-session, after which the next `process.cwd()` inside
  //     the OpenClaw agent (libuv `uv_cwd`) dies with
  //       "ENOENT: no such file or directory, uv_cwd"
  //     which OpenClaw surfaces to the user as
  //       "⚠️ Agent failed before reply: ENOENT: ... uv_cwd"
  //     (agent-runner-execution.ts).
  //
  // The C++ supervisor already pins the launcher's own cwd to stateDir for
  // the same reason (sigma_gateway_manager.cc / sigma_hermes_manager.cc) —
  // we mirror that here for the gateway child. stateDir is per-profile, we
  // own + create it (ensureDir above), and it survives any browser
  // self-update or `git checkout` of sigma-eclipse-agent in dev.
  //
  // `cwd` carries no semantic meaning for the gateway: every path it needs
  // is already supplied explicitly via env (OPENCLAW_STATE_DIR,
  // OPENCLAW_CONFIG_PATH, ...) or absolute CLI args, and `script` above is
  // resolved to an absolute path before this call.
  console.log(
    `${SPAWN_LOG_PREFIX} cwd=${stateDir} openclawDir=${openclawDir} script=${script} node=${nodeBin}`,
  );
  if (nodeOptionsWithGuard && cwdGuardPath) {
    console.log(`${SPAWN_LOG_PREFIX} cwdGuardPath=${cwdGuardPath}`);
  } else if (!cwdGuardPath) {
    console.warn(
      `${SPAWN_LOG_PREFIX} cwdGuardPath missing — gateway child will run without uv_cwd self-heal`,
    );
  }

  const child = spawn(nodeBin, args, {
    cwd: stateDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: getPlatform().gatewaySpawnOptions().detached,
  });

  console.log(`${SPAWN_LOG_PREFIX} spawned pid=${child.pid ?? "?"}`);

  child.stderr?.on("data", (chunk: Buffer) => {
    try {
      stderrTail.push(String(chunk));
    } catch {
      // ignore
    }
  });

  child.stdout?.pipe(stdout);
  child.stderr?.pipe(stderr);

  return child;
}
