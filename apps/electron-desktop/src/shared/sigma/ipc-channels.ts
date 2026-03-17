/**
 * sigma: IPC channel names for Local LLM functionality.
 * All channels are prefixed with "sigma:" to avoid collisions with upstream.
 */

export const SIGMA_IPC = {
  // Server
  serverStart: "sigma:server-start",
  serverStop: "sigma:server-stop",
  serverStatus: "sigma:server-status",

  // Download
  downloadCheckLlama: "sigma:download-check-llama",
  downloadLlama: "sigma:download-llama",
  downloadModel: "sigma:download-model",

  // Model
  modelList: "sigma:model-list",
  modelCheck: "sigma:model-check",
  modelDelete: "sigma:model-delete",
  modelGetActive: "sigma:model-get-active",
  modelSetActive: "sigma:model-set-active",

  // Settings
  settingsGet: "sigma:settings-get",
  settingsSetPort: "sigma:settings-set-port",
  settingsSetCtxSize: "sigma:settings-set-ctx-size",
  settingsSetGpuLayers: "sigma:settings-set-gpu-layers",

  // System
  systemMemory: "sigma:system-memory",
  systemRecommended: "sigma:system-recommended",

  // Paths
  pathsAppData: "sigma:paths-app-data",
  pathsLogs: "sigma:paths-logs",

  // Data management
  dataClearBinaries: "sigma:data-clear-binaries",
  dataClearModels: "sigma:data-clear-models",
  dataClearAll: "sigma:data-clear-all",

  // Runtime mode
  setRuntimeMode: "sigma:set-runtime-mode",
  getRuntimeMode: "sigma:get-runtime-mode",
} as const;

export const SIGMA_IPC_EVENTS = {
  downloadProgress: "sigma:download-progress",
} as const;

export type SigmaIpcChannel = (typeof SIGMA_IPC)[keyof typeof SIGMA_IPC];
export type SigmaIpcEventChannel = (typeof SIGMA_IPC_EVENTS)[keyof typeof SIGMA_IPC_EVENTS];
