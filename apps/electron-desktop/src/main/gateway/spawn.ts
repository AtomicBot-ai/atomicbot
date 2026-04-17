import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import type { BinaryPaths } from "../types";
import { ensureDir } from "../util/fs";
import { getPlatform } from "../platform";
import { getGogKeyringEnv } from "../gog/gog-keyring";
import type { TailBuffer } from "../util/net";
import { resolveFfmpegPath } from "../whisper/ffmpeg";
import { readSelectedWhisperModel } from "../whisper/model-state";
import { getModelDef, resolveModelPath } from "../whisper/models";

export function spawnGateway(
  params: Partial<BinaryPaths> & {
    port: number;
    logsDir: string;
    stateDir: string;
    configPath: string;
    token: string;
    openclawDir: string;
    nodeBin: string;
    whisperDataDir?: string;
    electronRunAsNode?: boolean;
    stderrTail: TailBuffer;
  }
): ChildProcess {
  const {
    port,
    logsDir,
    stateDir,
    configPath,
    token,
    openclawDir,
    nodeBin,
    gogBin,
    jqBin,
    memoBin,
    remindctlBin,
    obsidianCliBin,
    ghBin,
    whisperCliBin,
    whisperDataDir,
    electronRunAsNode,
    stderrTail,
  } = params;

  ensureDir(logsDir);
  ensureDir(stateDir);

  const stdoutPath = path.join(logsDir, "gateway.stdout.log");
  const stderrPath = path.join(logsDir, "gateway.stderr.log");
  const stdout = fs.createWriteStream(stdoutPath, { flags: "a" });
  const stderr = fs.createWriteStream(stderrPath, { flags: "a" });

  const script = path.join(openclawDir, "openclaw.mjs");
  // Important: first-run embedded app starts without a config file. Allow the Gateway to start
  // so the Control UI/WebChat + wizard flows can create config.
  // --verbose enables debug-level logging to help diagnose provider/model errors.
  const args = [
    // Node 22.x exposes `node:sqlite` behind this flag in some builds.
    // Keeping it here ensures embedded gateway parity across bundled runtimes.
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
  const envPath = typeof process.env.PATH === "string" ? process.env.PATH : "";
  const ffmpegBin = whisperDataDir ? resolveFfmpegPath(whisperDataDir) : undefined;
  const extraBinDirs = [
    nodeBin,
    jqBin,
    gogBin,
    memoBin,
    remindctlBin,
    obsidianCliBin,
    ghBin,
    whisperCliBin,
    ffmpegBin,
  ]
    .map((bin) => (bin ? path.dirname(bin) : ""))
    .filter(Boolean);
  const uniqueExtraBinDirs = Array.from(new Set(extraBinDirs));
  const mergedPath =
    uniqueExtraBinDirs.length > 0
      ? `${uniqueExtraBinDirs.join(path.delimiter)}${path.delimiter}${envPath}`
      : envPath;

  const ghConfigDir = path.join(stateDir, "gh");
  ensureDir(ghConfigDir);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    // On macOS, force gogcli to use an encrypted file backend instead of Keychain.
    ...getGogKeyringEnv(stateDir),
    // Keep all OpenClaw state inside the Electron app's userData directory.
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: configPath,
    OPENCLAW_GATEWAY_PORT: String(port),
    OPENCLAW_GATEWAY_TOKEN: token,
    // Ensure the embedded Gateway resolves bundled binaries via PATH (gog, jq, ...).
    PATH: mergedPath,
    // Ensure `gh` uses the app's own config storage.
    GH_CONFIG_DIR: ghConfigDir,
    // Point the gateway's whisper-cli media-understanding runner at the user's selected model.
    // When "openai" is selected, omit WHISPER_CPP_MODEL so the gateway uses the OpenAI API.
    ...(() => {
      if (!whisperDataDir) return {};
      const selected = readSelectedWhisperModel(stateDir);
      if (selected === "openai") return {};
      const modelPath = resolveModelPath(whisperDataDir, getModelDef(selected));
      console.log("[gateway] WHISPER_CPP_MODEL =", modelPath);
      return { WHISPER_CPP_MODEL: modelPath };
    })(),
    // Reduce noise in embedded contexts.
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    // Prevent the gateway from spawning a detached child on self-restart (SIGUSR1).
    // In-process restart keeps the same PID so Electron can always kill it on quit.
    OPENCLAW_NO_RESPAWN: "1",
  };

  // If we're spawning via Electron, force it into "Node mode" (otherwise it tries to launch a GUI process).
  if (electronRunAsNode) {
    env.ELECTRON_RUN_AS_NODE = "1";
  }

  const child = spawn(nodeBin, args, {
    cwd: openclawDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: getPlatform().gatewaySpawnOptions().detached,
  });

  child.stderr.on("data", (chunk) => {
    try {
      stderrTail.push(String(chunk));
    } catch {
      // ignore
    }
  });

  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);

  return child;
}
