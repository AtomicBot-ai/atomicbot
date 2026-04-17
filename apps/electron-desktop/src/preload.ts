import { contextBridge, ipcRenderer } from "electron";

import type {
  DesktopPlatform,
  NotificationsShowParams,
  OpenclawDesktopApi,
  UpdateAvailablePayload,
  UpdateDownloadProgressPayload,
  UpdateDownloadedPayload,
  UpdateErrorPayload,
} from "./shared/desktop-bridge-contract";
import { IPC, IPC_EVENTS } from "./shared/ipc-channels";

/** Helper: subscribe to an IPC event channel with automatic unsubscribe. */
function onIpc<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_evt: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

function toDesktopPlatform(value: string): DesktopPlatform {
  if (value === "darwin" || value === "win32" || value === "linux") {
    return value;
  }
  return "linux";
}

// Expose only the bare minimum to the renderer. The Control UI is served by the Gateway and
// does not require Electron privileged APIs.
const api: OpenclawDesktopApi = {
  platform: toDesktopPlatform(process.platform),
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
  setOnboardingState: async (onboarded: boolean) =>
    ipcRenderer.invoke(IPC.onboardingSetState, { onboarded }),
  startGateway: async () => ipcRenderer.invoke(IPC.gatewayStart),
  openExternal: async (url: string) => ipcRenderer.invoke(IPC.openExternal, { url }),
  extraModels: async () => ipcRenderer.invoke(IPC.extraModels),
  setApiKey: async (provider: string, apiKey: string) =>
    ipcRenderer.invoke(IPC.authSetApiKey, { provider, apiKey }),
  setSetupToken: async (provider: string, token: string) =>
    ipcRenderer.invoke(IPC.authSetSetupToken, { provider, token }),
  setSetupModeMarker: async (mode?: "paid" | "self-managed" | "local-model") =>
    ipcRenderer.invoke(IPC.authSetSetupModeMarker, mode ? { mode } : undefined),
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
  clawhubListSkills: async (params?: {
    q?: string;
    limit?: number;
    page?: number;
    sort?: string;
    dir?: string;
    nonSuspicious?: boolean;
  }) => ipcRenderer.invoke(IPC.clawhubListSkills, params),
  clawhubGetSkillPackage: async (params: { slug: string }) =>
    ipcRenderer.invoke(IPC.clawhubGetSkillPackage, params),
  clawhubGetSkillFile: async (params: { slug: string; path: string }) =>
    ipcRenderer.invoke(IPC.clawhubGetSkillFile, params),
  clawhubGetComments: async (params: { slug: string; limit?: number }) =>
    ipcRenderer.invoke(IPC.clawhubGetComments, params),
  llamacppSystemInfo: async () => ipcRenderer.invoke(IPC.llamacppSystemInfo),
  llamacppBackendStatus: async () => ipcRenderer.invoke(IPC.llamacppBackendStatus),
  llamacppBackendDownload: async () => ipcRenderer.invoke(IPC.llamacppBackendDownload),
  llamacppBackendDownloadCancel: async () => ipcRenderer.invoke(IPC.llamacppBackendDownloadCancel),
  llamacppBackendUpdate: async () => ipcRenderer.invoke(IPC.llamacppBackendUpdate),
  llamacppModelStatus: async (params?: { model?: string }) =>
    ipcRenderer.invoke(IPC.llamacppModelStatus, params),
  llamacppModelDownload: async (params?: { model?: string }) =>
    ipcRenderer.invoke(IPC.llamacppModelDownload, params),
  llamacppModelDownloadCancel: async () => ipcRenderer.invoke(IPC.llamacppModelDownloadCancel),
  llamacppModelDelete: async (params: { model: string }) =>
    ipcRenderer.invoke(IPC.llamacppModelDelete, params),
  onLlamacppBackendDownloadProgress: (
    cb: (payload: { percent: number; transferred: number; total: number }) => void
  ) => onIpc(IPC_EVENTS.llamacppBackendDownloadProgress, cb),
  onLlamacppModelDownloadProgress: (
    cb: (payload: { percent: number; transferred: number; total: number; modelId: string }) => void
  ) => onIpc(IPC_EVENTS.llamacppModelDownloadProgress, cb),
  llamacppModelsList: async () => ipcRenderer.invoke(IPC.llamacppModelsList),
  llamacppServerStart: async (params?: { model?: string }) =>
    ipcRenderer.invoke(IPC.llamacppServerStart, params),
  llamacppServerStop: async () => ipcRenderer.invoke(IPC.llamacppServerStop),
  llamacppClearActiveModel: async () => ipcRenderer.invoke(IPC.llamacppClearActiveModel),
  llamacppServerStatus: async () => ipcRenderer.invoke(IPC.llamacppServerStatus),
  llamacppSetActiveModel: async (params: { model: string }) =>
    ipcRenderer.invoke(IPC.llamacppSetActiveModel, params),
  llamacppWarmupGet: async () => ipcRenderer.invoke(IPC.llamacppWarmupGet),
  llamacppWarmupSet: async (params: {
    state: "idle" | "warming" | "done";
    modelId: string | null;
  }) => ipcRenderer.invoke(IPC.llamacppWarmupSet, params),
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
  analyticsGet: async () => ipcRenderer.invoke(IPC.analyticsGet),
  analyticsSet: async (enabled: boolean) => ipcRenderer.invoke(IPC.analyticsSet, { enabled }),
  defenderStatus: async () => ipcRenderer.invoke(IPC.defenderStatus),
  defenderApplyExclusions: async () => ipcRenderer.invoke(IPC.defenderApplyExclusions),
  defenderDismiss: async () => ipcRenderer.invoke(IPC.defenderDismiss),
  showNotification: async (params: NotificationsShowParams) =>
    ipcRenderer.invoke(IPC.notificationsShow, params),
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
};

contextBridge.exposeInMainWorld("openclawDesktop", api);
