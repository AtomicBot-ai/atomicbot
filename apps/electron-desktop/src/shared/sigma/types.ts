/**
 * sigma: Types for Local LLM functionality.
 */

export interface SigmaServerStatus {
  is_running: boolean;
  message: string;
}

export interface SigmaDownloadProgress {
  downloaded: number;
  total: number | null;
  percentage: number | null;
  message: string;
}

export interface SigmaAppSettings {
  active_model: string;
  port: number;
  ctx_size: number;
  gpu_layers: number;
}

export interface SigmaRecommendedSettings {
  memory_gb: number;
  recommended_model: string;
  recommended_ctx_size: number;
  recommended_gpu_layers: number;
}

export interface SigmaModelInfo {
  name: string;
  version: string;
  is_downloaded: boolean;
  path: string | null;
}

export interface SigmaModelConfig {
  version: string;
  filename: string;
  url: string;
  sha256: string;
}

export interface SigmaLlamaCppPlatform {
  url: string;
  sha256: string;
}

export interface SigmaLlamaCppConfig {
  version: string;
  platforms: Record<string, SigmaLlamaCppPlatform>;
}

export interface SigmaVersionsConfig {
  appVersion: string;
  llamaCpp: SigmaLlamaCppConfig;
  models: Record<string, SigmaModelConfig>;
}

export interface SigmaIpcState {
  server_pid: number | null;
  server_running: boolean;
  is_downloading: boolean;
  download_progress: number | null;
  server_port: number | null;
  server_ctx_size: number | null;
  server_gpu_layers: number | null;
  app_pid: number | null;
  app_heartbeat: number | null;
}

export interface SigmaServerConfig {
  port: number;
  ctx_size: number;
  gpu_layers: number;
}

export type SigmaRuntimeMode = "local-llm" | "openclaw";
