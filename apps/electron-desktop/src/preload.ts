import { contextBridge, ipcRenderer } from "electron";

import type {
  OpenclawDesktopApi,
  UpdateAvailablePayload,
  UpdateDownloadProgressPayload,
  UpdateDownloadedPayload,
  UpdateErrorPayload,
} from "./shared/desktop-bridge-contract";
import { IPC, IPC_EVENTS } from "./shared/ipc-channels";
// sigma: Local LLM IPC channels
import { SIGMA_IPC, SIGMA_IPC_EVENTS } from "./shared/sigma/ipc-channels";
import type { SigmaDownloadProgress, SigmaRuntimeMode } from "./shared/sigma/types";

/** Helper: subscribe to an IPC event channel with automatic unsubscribe. */
function onIpc<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_evt: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

// Expose only the bare minimum to the renderer. The Control UI is served by the Gateway and
// does not require Electron privileged APIs.
const api: OpenclawDesktopApi = {
  platform: process.platform,
  version: "0.0.0",
  openLogs: async () => ipcRenderer.invoke(IPC.openLogs),
  openWorkspaceFolder: async () => ipcRenderer.invoke(IPC.openWorkspaceFolder),
  openOpenclawFolder: async () => ipcRenderer.invoke(IPC.openOpenclawFolder),
  toggleDevTools: async () => ipcRenderer.invoke(IPC.devtoolsToggle),
  retry: async () => ipcRenderer.invoke(IPC.gatewayRetry),
  resetAndClose: async () => ipcRenderer.invoke(IPC.resetAndClose),
  getGatewayInfo: async () => ipcRenderer.invoke(IPC.gatewayGetInfo),
  getConsentInfo: async () => ipcRenderer.invoke(IPC.consentGet),
  acceptConsent: async () => ipcRenderer.invoke(IPC.consentAccept),
  getOnboarded: async () => ipcRenderer.invoke(IPC.onboardedGet),
  setOnboarded: async (onboarded: boolean) => ipcRenderer.invoke(IPC.onboardedSet, { onboarded }),
  startGateway: async () => ipcRenderer.invoke(IPC.gatewayStart),
  openExternal: async (url: string) => ipcRenderer.invoke(IPC.openExternal, { url }),
  setApiKey: async (provider: string, apiKey: string) =>
    ipcRenderer.invoke(IPC.authSetApiKey, { provider, apiKey }),
  setSetupToken: async (provider: string, token: string) =>
    ipcRenderer.invoke(IPC.authSetSetupToken, { provider, token }),
  validateApiKey: async (provider: string, apiKey: string) =>
    ipcRenderer.invoke(IPC.authValidateApiKey, { provider, apiKey }),
  authHasApiKey: async (provider: string) => ipcRenderer.invoke(IPC.authHasApiKey, { provider }),
  authReadProfiles: async () => ipcRenderer.invoke(IPC.authReadProfiles),
  authWriteProfiles: async (store: {
    profiles: Record<string, unknown>;
    order: Record<string, string[]>;
  }) => ipcRenderer.invoke(IPC.authWriteProfiles, store),
  oauthLogin: async (provider: string) => ipcRenderer.invoke(IPC.oauthLogin, { provider }),
  onOAuthProgress: (cb: (payload: { provider: string; message: string }) => void) =>
    onIpc(IPC_EVENTS.oauthProgress, cb),
  gogAuthList: async () => ipcRenderer.invoke(IPC.gogAuthList),
  gogAuthAdd: async (params: { account: string; services?: string; noInput?: boolean }) =>
    ipcRenderer.invoke(IPC.gogAuthAdd, params),
  gogAuthCredentials: async (params: { credentialsJson: string; filename?: string }) =>
    ipcRenderer.invoke(IPC.gogAuthCredentials, params),
  memoCheck: async () => ipcRenderer.invoke(IPC.memoCheck),
  remindctlAuthorize: async () => ipcRenderer.invoke(IPC.remindctlAuthorize),
  remindctlTodayJson: async () => ipcRenderer.invoke(IPC.remindctlTodayJson),
  obsidianCliCheck: async () => ipcRenderer.invoke(IPC.obsidianCliCheck),
  obsidianCliPrintDefaultPath: async () => ipcRenderer.invoke(IPC.obsidianCliPrintDefaultPath),
  obsidianVaultsList: async () => ipcRenderer.invoke(IPC.obsidianVaultsList),
  obsidianCliSetDefault: async (params: { vaultName: string }) =>
    ipcRenderer.invoke(IPC.obsidianCliSetDefault, params),
  ghCheck: async () => ipcRenderer.invoke(IPC.ghCheck),
  ghAuthLoginPat: async (params: { pat: string }) => ipcRenderer.invoke(IPC.ghAuthLoginPat, params),
  ghAuthStatus: async () => ipcRenderer.invoke(IPC.ghAuthStatus),
  ghApiUser: async () => ipcRenderer.invoke(IPC.ghApiUser),
  onGatewayState: (cb) => onIpc(IPC_EVENTS.gatewayState, cb),
  readConfig: async () => ipcRenderer.invoke(IPC.configRead),
  writeConfig: async (content: string) => ipcRenderer.invoke(IPC.configWrite, { content }),
  getLaunchAtLogin: async () => ipcRenderer.invoke(IPC.launchAtLoginGet),
  setLaunchAtLogin: async (enabled: boolean) =>
    ipcRenderer.invoke(IPC.launchAtLoginSet, { enabled }),
  getAppVersion: async () => ipcRenderer.invoke(IPC.getAppVersion),
  fetchReleaseNotes: async (version: string, owner: string, repo: string) =>
    ipcRenderer.invoke(IPC.fetchReleaseNotes, { version, owner, repo }),
  checkForUpdate: async () => ipcRenderer.invoke(IPC.updaterCheck),
  downloadUpdate: async () => ipcRenderer.invoke(IPC.updaterDownload),
  installUpdate: async () => ipcRenderer.invoke(IPC.updaterInstall),
  onUpdateAvailable: (cb: (payload: UpdateAvailablePayload) => void) =>
    onIpc(IPC_EVENTS.updaterAvailable, cb),
  onUpdateDownloadProgress: (cb: (payload: UpdateDownloadProgressPayload) => void) =>
    onIpc(IPC_EVENTS.updaterDownloadProgress, cb),
  onUpdateDownloaded: (cb: (payload: UpdateDownloadedPayload) => void) =>
    onIpc(IPC_EVENTS.updaterDownloaded, cb),
  onUpdateError: (cb: (payload: UpdateErrorPayload) => void) => onIpc(IPC_EVENTS.updaterError, cb),
  createBackup: async (mode?: string) => ipcRenderer.invoke(IPC.backupCreate, { mode }),
  restoreBackup: async (data: string, filename?: string) =>
    ipcRenderer.invoke(IPC.backupRestore, { data, filename }),
  detectLocalOpenclaw: async () => ipcRenderer.invoke(IPC.backupDetectLocal),
  restoreFromDirectory: async (dirPath: string) =>
    ipcRenderer.invoke(IPC.backupRestoreFromDir, { dirPath }),
  selectOpenclawFolder: async () => ipcRenderer.invoke(IPC.backupSelectFolder),
  installCustomSkill: async (data: string) => ipcRenderer.invoke(IPC.installCustomSkill, { data }),
  listCustomSkills: async () => ipcRenderer.invoke(IPC.listCustomSkills),
  removeCustomSkill: async (dirName: string) =>
    ipcRenderer.invoke(IPC.removeCustomSkill, { dirName }),
  whisperModelStatus: async (params?: { model?: string }) =>
    ipcRenderer.invoke(IPC.whisperModelStatus, params),
  whisperModelDownload: async (params?: { model?: string }) =>
    ipcRenderer.invoke(IPC.whisperModelDownload, params),
  whisperModelDownloadCancel: async () => ipcRenderer.invoke(IPC.whisperModelDownloadCancel),
  whisperSetGatewayModel: async (modelId: string) =>
    ipcRenderer.invoke(IPC.whisperSetGatewayModel, modelId),
  onWhisperModelDownloadProgress: (
    cb: (payload: { percent: number; transferred: number; total: number }) => void
  ) => onIpc(IPC_EVENTS.whisperModelDownloadProgress, cb),
  whisperModelsList: async () => ipcRenderer.invoke(IPC.whisperModelsList),
  whisperTranscribe: async (params: { audio: string; language?: string; model?: string }) =>
    ipcRenderer.invoke(IPC.whisperTranscribe, params),
  focusWindow: async () => ipcRenderer.invoke(IPC.focusWindow),
  defenderStatus: async () => ipcRenderer.invoke(IPC.defenderStatus),
  defenderApplyExclusions: async () => ipcRenderer.invoke(IPC.defenderApplyExclusions),
  defenderDismiss: async () => ipcRenderer.invoke(IPC.defenderDismiss),
  onDeepLink: (
    cb: (payload: { host: string; pathname: string; params: Record<string, string> }) => void
  ) => onIpc(IPC_EVENTS.deepLink, cb),
  terminalCreate: async () => ipcRenderer.invoke(IPC.terminalCreate),
  terminalWrite: async (id: string, data: string) =>
    ipcRenderer.invoke(IPC.terminalWrite, { id, data }),
  terminalResize: async (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke(IPC.terminalResize, { id, cols, rows }),
  terminalKill: async (id: string) => ipcRenderer.invoke(IPC.terminalKill, { id }),
  terminalList: async () => ipcRenderer.invoke(IPC.terminalList),
  terminalGetBuffer: async (id: string) => ipcRenderer.invoke(IPC.terminalGetBuffer, { id }),
  onTerminalData: (cb: (payload: { id: string; data: string }) => void) =>
    onIpc(IPC_EVENTS.terminalData, cb),
  onTerminalExit: (cb: (payload: { id: string; exitCode: number; signal?: number }) => void) =>
    onIpc(IPC_EVENTS.terminalExit, cb),

  // sigma: Local LLM API
  sigmaStartServer: async () => ipcRenderer.invoke(SIGMA_IPC.serverStart),
  sigmaStopServer: async () => ipcRenderer.invoke(SIGMA_IPC.serverStop),
  sigmaGetServerStatus: async () => ipcRenderer.invoke(SIGMA_IPC.serverStatus),
  sigmaCheckLlamaVersion: async () => ipcRenderer.invoke(SIGMA_IPC.downloadCheckLlama),
  sigmaDownloadLlamaCpp: async () => ipcRenderer.invoke(SIGMA_IPC.downloadLlama),
  sigmaDownloadModel: async (modelName: string) =>
    ipcRenderer.invoke(SIGMA_IPC.downloadModel, { modelName }),
  sigmaListModels: async () => ipcRenderer.invoke(SIGMA_IPC.modelList),
  sigmaCheckModel: async (modelName: string) =>
    ipcRenderer.invoke(SIGMA_IPC.modelCheck, { modelName }),
  sigmaDeleteModel: async (modelName: string) =>
    ipcRenderer.invoke(SIGMA_IPC.modelDelete, { modelName }),
  sigmaGetActiveModel: async () => ipcRenderer.invoke(SIGMA_IPC.modelGetActive),
  sigmaSetActiveModel: async (modelName: string) =>
    ipcRenderer.invoke(SIGMA_IPC.modelSetActive, { modelName }),
  sigmaGetSettings: async () => ipcRenderer.invoke(SIGMA_IPC.settingsGet),
  sigmaSetPort: async (port: number) => ipcRenderer.invoke(SIGMA_IPC.settingsSetPort, { port }),
  sigmaSetCtxSize: async (ctxSize: number) =>
    ipcRenderer.invoke(SIGMA_IPC.settingsSetCtxSize, { ctxSize }),
  sigmaSetGpuLayers: async (gpuLayers: number) =>
    ipcRenderer.invoke(SIGMA_IPC.settingsSetGpuLayers, { gpuLayers }),
  sigmaGetSystemMemory: async () => ipcRenderer.invoke(SIGMA_IPC.systemMemory),
  sigmaGetRecommendedSettings: async () => ipcRenderer.invoke(SIGMA_IPC.systemRecommended),
  sigmaGetAppDataPath: async () => ipcRenderer.invoke(SIGMA_IPC.pathsAppData),
  sigmaGetLogsPath: async () => ipcRenderer.invoke(SIGMA_IPC.pathsLogs),
  sigmaClearBinaries: async () => ipcRenderer.invoke(SIGMA_IPC.dataClearBinaries),
  sigmaClearModels: async () => ipcRenderer.invoke(SIGMA_IPC.dataClearModels),
  sigmaClearAllData: async () => ipcRenderer.invoke(SIGMA_IPC.dataClearAll),
  sigmaSetRuntimeMode: async (mode: SigmaRuntimeMode) =>
    ipcRenderer.invoke(SIGMA_IPC.setRuntimeMode, { mode }),
  sigmaGetRuntimeMode: async () => ipcRenderer.invoke(SIGMA_IPC.getRuntimeMode),
  onSigmaDownloadProgress: (cb: (payload: SigmaDownloadProgress) => void) =>
    onIpc(SIGMA_IPC_EVENTS.downloadProgress, cb),
};

contextBridge.exposeInMainWorld("openclawDesktop", api);
