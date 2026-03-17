import { type ChildProcess, spawn, execSync } from "node:child_process";
import * as fs from "node:fs";

import type { SigmaServerConfig } from "../../../shared/sigma/types";
import { getLlamaBinaryPath, getModelFilePath } from "./paths";
import { getActiveModel } from "./settings";
import { isProcessRunning, readIpcState, updateServerStatus, writeIpcState } from "./ipc-state";

export function validateConfig(config: SigmaServerConfig): void {
  if (config.ctx_size < 6000 || config.ctx_size > 100000) {
    throw new Error("Context size must be between 6000 and 100000");
  }
  if (config.gpu_layers > 41) {
    throw new Error("GPU layers must be between 0 and 41");
  }
}

export function checkServerRunning(): number | null {
  const state = readIpcState();

  if (state.server_running && state.server_pid != null) {
    if (isProcessRunning(state.server_pid)) {
      return state.server_pid;
    }
    updateServerStatus(false, null);
  }

  return null;
}

export function startServerProcess(
  config: SigmaServerConfig,
  captureOutput: boolean
): ChildProcess {
  validateConfig(config);

  const existingPid = checkServerRunning();
  if (existingPid != null) {
    throw new Error(`Server is already running (PID: ${existingPid})`);
  }

  const binaryPath = getLlamaBinaryPath();
  const activeModel = getActiveModel();
  const modelPath = getModelFilePath(activeModel);

  if (!fs.existsSync(binaryPath)) {
    throw new Error("llama.cpp not found. Please download it first.");
  }
  if (!fs.existsSync(modelPath)) {
    throw new Error(`Model '${activeModel}' not found. Please download it first.`);
  }

  console.info(`Starting llama-server with binary: ${binaryPath}`);
  console.info(`Using model: ${modelPath}`);
  console.info(
    `Config: port=${config.port}, ctx_size=${config.ctx_size}, gpu_layers=${config.gpu_layers}`
  );

  const args = [
    "-m",
    modelPath,
    "--port",
    String(config.port),
    "--ctx-size",
    String(config.ctx_size),
    "--n-gpu-layers",
    String(config.gpu_layers),
    "--flash-attn",
    "auto",
    "--batch-size",
    "2048",
    "--ubatch-size",
    "512",
  ];

  const stdio = captureOutput ? "pipe" : "ignore";

  const child = spawn(binaryPath, args, {
    stdio: [stdio, stdio, stdio] as const,
    detached: process.platform !== "win32",
    windowsHide: true,
  });

  const pid = child.pid;
  if (pid == null) {
    throw new Error("Failed to start server process");
  }

  console.info(`Server started with PID: ${pid}`);

  updateServerStatus(true, pid);

  const state = readIpcState();
  state.server_port = config.port;
  state.server_ctx_size = config.ctx_size;
  state.server_gpu_layers = config.gpu_layers;
  writeIpcState(state);

  return child;
}

export function stopServerByPid(pid: number): void {
  console.info(`Stopping server (PID: ${pid})`);

  if (process.platform === "win32") {
    try {
      execSync(`taskkill /F /PID ${pid}`, { windowsHide: true });
    } catch {
      // process may already be dead
    }
  } else {
    try {
      process.kill(-pid, "SIGTERM");
      setTimeout(() => {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          // already dead
        }
      }, 100);
    } catch {
      // process may already be dead
    }
  }

  updateServerStatus(false, null);

  const state = readIpcState();
  state.server_port = null;
  state.server_ctx_size = null;
  state.server_gpu_layers = null;
  writeIpcState(state);

  console.info("Server stopped");
}

export function getStatus(): { isRunning: boolean; pid: number | null } {
  const state = readIpcState();

  let isRunning = false;
  if (state.server_running && state.server_pid != null) {
    isRunning = isProcessRunning(state.server_pid);
  }

  if (state.server_running && !isRunning) {
    updateServerStatus(false, null);
  }

  return { isRunning, pid: state.server_pid };
}
