import { ipcMain } from "electron";

import { SIGMA_IPC } from "../../../shared/sigma/ipc-channels";
import type { SigmaServerStatus } from "../../../shared/sigma/types";
import {
  getStatus,
  startServerProcess,
  stopServerByPid,
} from "../../sigma/services/server-manager";
import { getServerSettings } from "../../sigma/services/settings";
import { updateServerStatus } from "../../sigma/services/ipc-state";
import type { SigmaHandlerParams } from "./types";

export function registerSigmaServerHandlers(params: SigmaHandlerParams): void {
  ipcMain.handle(SIGMA_IPC.serverStart, async (): Promise<string> => {
    const processRef = params.serverProcess;

    if (processRef.current) {
      try {
        const exited = processRef.current.exitCode !== null;
        if (!exited) {
          return "Server is already running";
        }
      } catch {
        /* ignore */
      }
      processRef.current = null;
    }

    const { port, ctx_size, gpu_layers } = getServerSettings();
    const child = startServerProcess({ port, ctx_size, gpu_layers }, true);

    if (child.stdout) {
      child.stdout.on("data", (data: Buffer) => {
        console.info(`[llama.cpp] ${data.toString().trim()}`);
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (data: Buffer) => {
        console.warn(`[llama.cpp] ${data.toString().trim()}`);
      });
    }

    processRef.current = child;
    return `Server started on port ${port} (PID: ${child.pid}, ctx: ${ctx_size}, gpu layers: ${gpu_layers})`;
  });

  ipcMain.handle(SIGMA_IPC.serverStop, async (): Promise<string> => {
    const processRef = params.serverProcess;

    if (processRef.current) {
      const pid = processRef.current.pid;
      if (pid) {
        stopServerByPid(pid);
      }
      try {
        processRef.current.kill();
      } catch {
        /* ignore */
      }
      processRef.current = null;
      return "Server stopped";
    }

    const { isRunning, pid } = getStatus();
    if (isRunning && pid) {
      stopServerByPid(pid);
      return `Server stopped (PID: ${pid})`;
    }

    throw new Error("LLM is not running");
  });

  ipcMain.handle(SIGMA_IPC.serverStatus, async (): Promise<SigmaServerStatus> => {
    const processRef = params.serverProcess;

    if (processRef.current) {
      if (processRef.current.exitCode === null) {
        return { is_running: true, message: "LLM is running" };
      }
      const status = processRef.current.exitCode;
      processRef.current = null;
      updateServerStatus(false, null);
      return { is_running: false, message: `LLM exited with status: ${status}` };
    }

    const { isRunning, pid } = getStatus();
    return {
      is_running: isRunning,
      message: isRunning ? `LLM is running (PID: ${pid})` : "LLM is not running",
    };
  });
}
