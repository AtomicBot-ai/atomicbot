import * as fs from "node:fs";
import * as os from "node:os";
import { execSync } from "node:child_process";

import type { SigmaRecommendedSettings } from "../../../shared/sigma/types";
import { getAppDataDir, getBinDir, getModelsRootDir } from "./paths";

export function getSystemMemoryGb(): number {
  return Math.floor(os.totalmem() / (1024 * 1024 * 1024));
}

interface GpuInfo {
  hasNvidia: boolean;
  vramGb: number;
  is10xxSeries: boolean;
}

function detect10xxSeries(output: string): boolean {
  const lower = output.toLowerCase();
  return (
    lower.includes("gtx 10") ||
    lower.includes("geforce gtx 10") ||
    lower.includes("gtx105") ||
    lower.includes("gtx106") ||
    lower.includes("gtx107") ||
    lower.includes("gtx108")
  );
}

function parseVramFromWmic(output: string): number | null {
  for (const line of output.split("\n")) {
    if (line.includes("nvidia") || line.includes("NVIDIA")) {
      const parts = line.trim().split(/\s+/);
      if (parts.length > 0) {
        const ramBytes = parseInt(parts[0]!, 10);
        if (!isNaN(ramBytes) && ramBytes > 500_000_000) {
          return Math.floor(ramBytes / (1024 * 1024 * 1024));
        }
      }
    }
  }
  return null;
}

function detectNvidiaGpu(): GpuInfo {
  if (process.platform !== "win32") {
    return { hasNvidia: false, vramGb: 0, is10xxSeries: false };
  }

  const gpu: GpuInfo = { hasNvidia: false, vramGb: 0, is10xxSeries: false };

  try {
    const wmicOutput = execSync("wmic path win32_VideoController get name,AdapterRAM", {
      windowsHide: true,
      encoding: "utf-8",
    });

    if (wmicOutput.toLowerCase().includes("nvidia")) {
      gpu.hasNvidia = true;
      gpu.is10xxSeries = detect10xxSeries(wmicOutput);
      const vram = parseVramFromWmic(wmicOutput);
      if (vram != null) {
        gpu.vramGb = vram;
      }
    }
  } catch {
    // wmic may not be available
  }

  try {
    const smiOutput = execSync(
      "nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits",
      { windowsHide: true, encoding: "utf-8" }
    );
    const vramMb = parseInt(smiOutput.trim(), 10);
    if (!isNaN(vramMb)) {
      const vramGb = Math.floor(vramMb / 1024);
      if (!gpu.hasNvidia) gpu.hasNvidia = true;
      if (vramGb > 0 && vramGb > gpu.vramGb) {
        gpu.vramGb = vramGb;
      }
    }
  } catch {
    // nvidia-smi may not be available
  }

  return gpu;
}

function calculateCtxSizeByRam(memoryGb: number): number {
  if (memoryGb < 16) return 6000;
  if (memoryGb < 24) return 12000;
  return 28000;
}

function getPlatformSettings(memoryGb: number): { model: string; ctxSize: number } {
  if (process.platform === "darwin") {
    const model = memoryGb < 16 ? "model_s" : "model";
    return { model, ctxSize: calculateCtxSizeByRam(memoryGb) };
  }

  if (process.platform === "win32") {
    const gpu = detectNvidiaGpu();

    if (!gpu.hasNvidia) {
      return { model: "model_s", ctxSize: calculateCtxSizeByRam(memoryGb) };
    }
    if (gpu.is10xxSeries) {
      const model = gpu.vramGb < 7 ? "model_s" : "model";
      return { model, ctxSize: 12000 };
    }
    if (gpu.vramGb < 7) {
      return { model: "model_s", ctxSize: calculateCtxSizeByRam(memoryGb) };
    }
    return { model: "model", ctxSize: calculateCtxSizeByRam(memoryGb) };
  }

  const model = memoryGb < 15 ? "model_s" : "model";
  return { model, ctxSize: calculateCtxSizeByRam(memoryGb) };
}

export function calculateRecommendedSettings(): SigmaRecommendedSettings {
  const memoryGb = getSystemMemoryGb();
  const { model, ctxSize } = getPlatformSettings(memoryGb);

  return {
    memory_gb: memoryGb,
    recommended_model: model,
    recommended_ctx_size: ctxSize,
    recommended_gpu_layers: 41,
  };
}

function stopServerProcessSync(serverProcess: {
  current: import("node:child_process").ChildProcess | null;
}): void {
  const child = serverProcess.current;
  if (child && child.pid) {
    if (process.platform !== "win32") {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        /* already dead */
      }
    }
    try {
      child.kill();
    } catch {
      /* already dead */
    }
    serverProcess.current = null;
  }
}

export function clearBinaries(serverProcess: {
  current: import("node:child_process").ChildProcess | null;
}): void {
  stopServerProcessSync(serverProcess);
  const binDir = getBinDir();
  if (fs.existsSync(binDir)) {
    fs.rmSync(binDir, { recursive: true, force: true });
    console.info(`Removed bin directory: ${binDir}`);
  }
}

export function clearModels(): void {
  const modelsDir = getModelsRootDir();
  if (fs.existsSync(modelsDir)) {
    fs.rmSync(modelsDir, { recursive: true, force: true });
    console.info(`Removed models directory: ${modelsDir}`);
  }
}

export function clearAllData(serverProcess: {
  current: import("node:child_process").ChildProcess | null;
}): void {
  stopServerProcessSync(serverProcess);
  const appDir = getAppDataDir();
  if (fs.existsSync(appDir)) {
    fs.rmSync(appDir, { recursive: true, force: true });
    console.info(`Removed app data directory: ${appDir}`);
  }
}
