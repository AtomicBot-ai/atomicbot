import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { ensureDir } from "@electron-main/util/fs";
import { getPlatform } from "@electron-main/platform";
import type { TailBuffer } from "@electron-main/util/net";

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
    // Point browser-tool at the running Sigma binary (resolved by the C++
    // supervisor from base::FILE_EXE, so it works in both dev and packaged runs).
    ...(browserExecutablePath
      ? { OPENCLAW_BROWSER_EXECUTABLE_PATH: browserExecutablePath }
      : {}),
  };

  const child = spawn(nodeBin, args, {
    cwd: openclawDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: getPlatform().gatewaySpawnOptions().detached,
  });

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
