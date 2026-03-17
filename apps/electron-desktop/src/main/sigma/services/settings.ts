import * as fs from "node:fs";
import * as path from "node:path";

import type { SigmaAppSettings } from "../../../shared/sigma/types";
import { calculateRecommendedSettings } from "./system-info";
import { getAppDataDir } from "./paths";

const DEFAULT_SETTINGS: SigmaAppSettings = {
  active_model: "model",
  port: 10345,
  ctx_size: 8192,
  gpu_layers: 0,
};

function getSettingsPath(): string {
  return path.join(getAppDataDir(), "settings.json");
}

function createDefaultSettings(): SigmaAppSettings {
  try {
    const recommended = calculateRecommendedSettings();
    return {
      active_model: recommended.recommended_model,
      port: 10345,
      ctx_size: recommended.recommended_ctx_size,
      gpu_layers: recommended.recommended_gpu_layers,
    };
  } catch (e) {
    console.warn("Failed to get recommended settings, using defaults:", e);
    return { ...DEFAULT_SETTINGS };
  }
}

export function loadSettings(): SigmaAppSettings {
  const settingsPath = getSettingsPath();

  if (!fs.existsSync(settingsPath)) {
    const settings = createDefaultSettings();
    saveSettings(settings);
    return settings;
  }

  const content = fs.readFileSync(settingsPath, "utf-8");
  return JSON.parse(content) as SigmaAppSettings;
}

export function saveSettings(settings: SigmaAppSettings): void {
  const settingsPath = getSettingsPath();
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

export function getActiveModel(): string {
  return loadSettings().active_model;
}

export function setActiveModel(modelName: string): void {
  const settings = loadSettings();
  settings.active_model = modelName;
  saveSettings(settings);
}

export function getServerSettings(): { port: number; ctx_size: number; gpu_layers: number } {
  const settings = loadSettings();
  return { port: settings.port, ctx_size: settings.ctx_size, gpu_layers: settings.gpu_layers };
}

export function setPort(port: number): void {
  const settings = loadSettings();
  settings.port = port;
  saveSettings(settings);
}

export function setCtxSize(ctxSize: number): void {
  const settings = loadSettings();
  settings.ctx_size = ctxSize;
  saveSettings(settings);
}

export function setGpuLayers(gpuLayers: number): void {
  const settings = loadSettings();
  settings.gpu_layers = gpuLayers;
  saveSettings(settings);
}
