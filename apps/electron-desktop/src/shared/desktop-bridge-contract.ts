import type { GogExecResult } from "../main/gog/types";
import type { GatewayState, ResetAndCloseResult } from "../main/types";
import type { ExecResult } from "./types";
// sigma: Local LLM types
import type {
  SigmaAppSettings,
  SigmaDownloadProgress,
  SigmaModelInfo,
  SigmaRecommendedSettings,
  SigmaRuntimeMode,
  SigmaServerStatus,
} from "./sigma/types";

export type UpdateAvailablePayload = {
  version: string;
  releaseDate?: string;
};

export type UpdateDownloadProgressPayload = {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
};

export type UpdateDownloadedPayload = {
  version: string;
};

export type UpdateErrorPayload = {
  message: string;
};

export interface OpenclawDesktopApi {
  platform: NodeJS.Platform;
  version: string;
  openLogs: () => Promise<void>;
  openWorkspaceFolder: () => Promise<void>;
  openOpenclawFolder: () => Promise<void>;
  toggleDevTools: () => Promise<void>;
  retry: () => Promise<void>;
  resetAndClose: () => Promise<ResetAndCloseResult>;
  getGatewayInfo: () => Promise<{ state: GatewayState | null }>;
  getConsentInfo: () => Promise<{ accepted: boolean }>;
  acceptConsent: () => Promise<{ ok: true }>;
  getOnboarded: () => Promise<{ onboarded: boolean }>;
  setOnboarded: (onboarded: boolean) => Promise<{ ok: true }>;
  startGateway: () => Promise<{ ok: true }>;
  openExternal: (url: string) => Promise<void>;
  setApiKey: (provider: string, apiKey: string) => Promise<{ ok: true }>;
  setSetupToken: (provider: string, token: string) => Promise<{ ok: true }>;
  validateApiKey: (provider: string, apiKey: string) => Promise<{ valid: boolean; error?: string }>;
  authHasApiKey: (provider: string) => Promise<{ configured: boolean }>;
  authReadProfiles: () => Promise<{
    profiles: Record<string, { type: string; provider: string; [k: string]: unknown }>;
    order: Record<string, string[]>;
  }>;
  authWriteProfiles: (store: {
    profiles: Record<string, unknown>;
    order: Record<string, string[]>;
  }) => Promise<{ ok: true }>;
  oauthLogin: (provider: string) => Promise<{ ok: true; profileId: string }>;
  onOAuthProgress: (cb: (payload: { provider: string; message: string }) => void) => () => void;
  gogAuthList: () => Promise<GogExecResult>;
  gogAuthAdd: (params: {
    account: string;
    services?: string;
    noInput?: boolean;
  }) => Promise<GogExecResult>;
  gogAuthCredentials: (params: {
    credentialsJson: string;
    filename?: string;
  }) => Promise<GogExecResult>;
  memoCheck: () => Promise<ExecResult>;
  remindctlAuthorize: () => Promise<ExecResult>;
  remindctlTodayJson: () => Promise<ExecResult>;
  obsidianCliCheck: () => Promise<ExecResult>;
  obsidianCliPrintDefaultPath: () => Promise<ExecResult>;
  obsidianVaultsList: () => Promise<ExecResult>;
  obsidianCliSetDefault: (params: { vaultName: string }) => Promise<ExecResult>;
  ghCheck: () => Promise<ExecResult>;
  ghAuthLoginPat: (params: { pat: string }) => Promise<ExecResult>;
  ghAuthStatus: () => Promise<ExecResult>;
  ghApiUser: () => Promise<ExecResult>;
  onGatewayState: (cb: (state: GatewayState) => void) => () => void;
  readConfig: () => Promise<{ ok: boolean; content: string; error?: string }>;
  writeConfig: (content: string) => Promise<{ ok: boolean; error?: string }>;
  getLaunchAtLogin: () => Promise<{ enabled: boolean }>;
  setLaunchAtLogin: (enabled: boolean) => Promise<{ ok: true }>;
  getAppVersion: () => Promise<{ version: string }>;
  fetchReleaseNotes: (
    version: string,
    owner: string,
    repo: string
  ) => Promise<{ ok: boolean; body: string; htmlUrl: string }>;
  checkForUpdate: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  onUpdateAvailable: (cb: (payload: UpdateAvailablePayload) => void) => () => void;
  onUpdateDownloadProgress: (cb: (payload: UpdateDownloadProgressPayload) => void) => () => void;
  onUpdateDownloaded: (cb: (payload: UpdateDownloadedPayload) => void) => () => void;
  onUpdateError: (cb: (payload: UpdateErrorPayload) => void) => () => void;
  createBackup: (mode?: string) => Promise<{ ok: boolean; cancelled?: boolean; error?: string }>;
  restoreBackup: (
    data: string,
    filename?: string
  ) => Promise<{ ok: boolean; error?: string; meta?: { mode?: string } }>;
  detectLocalOpenclaw: () => Promise<{ found: boolean; path: string }>;
  restoreFromDirectory: (
    dirPath: string
  ) => Promise<{ ok: boolean; error?: string; meta?: { mode?: string } }>;
  selectOpenclawFolder: () => Promise<{
    ok: boolean;
    path?: string;
    cancelled?: boolean;
    error?: string;
  }>;
  installCustomSkill: (data: string) => Promise<{
    ok: boolean;
    skill?: { name: string; description: string; emoji: string; dirName: string };
    error?: string;
  }>;
  listCustomSkills: () => Promise<{
    ok: boolean;
    skills: Array<{ name: string; description: string; emoji: string; dirName: string }>;
  }>;
  removeCustomSkill: (dirName: string) => Promise<{ ok: boolean; error?: string }>;
  whisperModelStatus: (params?: { model?: string }) => Promise<{
    modelReady: boolean;
    binReady: boolean;
    modelPath: string;
    size: number;
    modelId: string;
  }>;
  whisperModelDownload: (params?: { model?: string }) => Promise<{
    ok: boolean;
    modelPath?: string;
    error?: string;
  }>;
  whisperModelDownloadCancel: () => Promise<{ ok: boolean }>;
  whisperSetGatewayModel: (modelId: string) => Promise<{ ok: boolean; error?: string }>;
  onWhisperModelDownloadProgress: (
    cb: (payload: { percent: number; transferred: number; total: number }) => void
  ) => () => void;
  whisperModelsList: () => Promise<
    Array<{
      id: string;
      label: string;
      description: string;
      sizeLabel: string;
      downloaded: boolean;
      size: number;
    }>
  >;
  whisperTranscribe: (params: {
    audio: string;
    language?: string;
    model?: string;
  }) => Promise<{ ok: boolean; text?: string; error?: string }>;
  focusWindow: () => Promise<void>;
  defenderStatus: () => Promise<{ applied: boolean; dismissed: boolean; isWindows: boolean }>;
  defenderApplyExclusions: () => Promise<{ ok: boolean; error?: string }>;
  defenderDismiss: () => Promise<{ ok: boolean }>;
  onDeepLink: (
    cb: (payload: { host: string; pathname: string; params: Record<string, string> }) => void
  ) => () => void;
  terminalCreate: () => Promise<{ id: string }>;
  terminalWrite: (id: string, data: string) => Promise<void>;
  terminalResize: (id: string, cols: number, rows: number) => Promise<void>;
  terminalKill: (id: string) => Promise<void>;
  terminalList: () => Promise<Array<{ id: string; alive: boolean }>>;
  terminalGetBuffer: (id: string) => Promise<string>;
  onTerminalData: (cb: (payload: { id: string; data: string }) => void) => () => void;
  onTerminalExit: (
    cb: (payload: { id: string; exitCode: number; signal?: number }) => void
  ) => () => void;

  // sigma: Local LLM API
  sigmaStartServer: () => Promise<string>;
  sigmaStopServer: () => Promise<string>;
  sigmaGetServerStatus: () => Promise<SigmaServerStatus>;
  sigmaCheckLlamaVersion: () => Promise<boolean>;
  sigmaDownloadLlamaCpp: () => Promise<string>;
  sigmaDownloadModel: (modelName: string) => Promise<string>;
  sigmaListModels: () => Promise<SigmaModelInfo[]>;
  sigmaCheckModel: (modelName: string) => Promise<boolean>;
  sigmaDeleteModel: (modelName: string) => Promise<string>;
  sigmaGetActiveModel: () => Promise<string>;
  sigmaSetActiveModel: (modelName: string) => Promise<string>;
  sigmaGetSettings: () => Promise<SigmaAppSettings>;
  sigmaSetPort: (port: number) => Promise<string>;
  sigmaSetCtxSize: (ctxSize: number) => Promise<string>;
  sigmaSetGpuLayers: (gpuLayers: number) => Promise<string>;
  sigmaGetSystemMemory: () => Promise<number>;
  sigmaGetRecommendedSettings: () => Promise<SigmaRecommendedSettings>;
  sigmaGetAppDataPath: () => Promise<string>;
  sigmaGetLogsPath: () => Promise<string>;
  sigmaClearBinaries: () => Promise<string>;
  sigmaClearModels: () => Promise<string>;
  sigmaClearAllData: () => Promise<string>;
  sigmaSetRuntimeMode: (mode: SigmaRuntimeMode) => Promise<{ ok: true }>;
  sigmaGetRuntimeMode: () => Promise<{ mode: SigmaRuntimeMode }>;
  onSigmaDownloadProgress: (cb: (payload: SigmaDownloadProgress) => void) => () => void;
}

export const DESKTOP_BRIDGE_KEYS: ReadonlyArray<keyof OpenclawDesktopApi> = [
  "platform",
  "version",
  "openLogs",
  "openWorkspaceFolder",
  "openOpenclawFolder",
  "toggleDevTools",
  "retry",
  "resetAndClose",
  "getGatewayInfo",
  "getConsentInfo",
  "acceptConsent",
  "getOnboarded",
  "setOnboarded",
  "startGateway",
  "openExternal",
  "setApiKey",
  "setSetupToken",
  "validateApiKey",
  "authHasApiKey",
  "oauthLogin",
  "onOAuthProgress",
  "gogAuthList",
  "gogAuthAdd",
  "gogAuthCredentials",
  "memoCheck",
  "remindctlAuthorize",
  "remindctlTodayJson",
  "obsidianCliCheck",
  "obsidianCliPrintDefaultPath",
  "obsidianVaultsList",
  "obsidianCliSetDefault",
  "ghCheck",
  "ghAuthLoginPat",
  "ghAuthStatus",
  "ghApiUser",
  "onGatewayState",
  "readConfig",
  "writeConfig",
  "getLaunchAtLogin",
  "setLaunchAtLogin",
  "getAppVersion",
  "fetchReleaseNotes",
  "checkForUpdate",
  "downloadUpdate",
  "installUpdate",
  "onUpdateAvailable",
  "onUpdateDownloadProgress",
  "onUpdateDownloaded",
  "onUpdateError",
  "createBackup",
  "restoreBackup",
  "detectLocalOpenclaw",
  "restoreFromDirectory",
  "selectOpenclawFolder",
  "installCustomSkill",
  "listCustomSkills",
  "removeCustomSkill",
  "defenderStatus",
  "defenderApplyExclusions",
  "defenderDismiss",
  "terminalCreate",
  "terminalWrite",
  "terminalResize",
  "terminalKill",
  "terminalList",
  "terminalGetBuffer",
  "whisperModelStatus",
  "whisperModelDownload",
  "whisperModelDownloadCancel",
  "whisperSetGatewayModel",
  "onWhisperModelDownloadProgress",
  "whisperModelsList",
  "whisperTranscribe",
  "focusWindow",
  "authReadProfiles",
  "authWriteProfiles",
  "onDeepLink",
  "onTerminalData",
  "onTerminalExit",
  // sigma: Local LLM keys
  "sigmaStartServer",
  "sigmaStopServer",
  "sigmaGetServerStatus",
  "sigmaCheckLlamaVersion",
  "sigmaDownloadLlamaCpp",
  "sigmaDownloadModel",
  "sigmaListModels",
  "sigmaCheckModel",
  "sigmaDeleteModel",
  "sigmaGetActiveModel",
  "sigmaSetActiveModel",
  "sigmaGetSettings",
  "sigmaSetPort",
  "sigmaSetCtxSize",
  "sigmaSetGpuLayers",
  "sigmaGetSystemMemory",
  "sigmaGetRecommendedSettings",
  "sigmaGetAppDataPath",
  "sigmaGetLogsPath",
  "sigmaClearBinaries",
  "sigmaClearModels",
  "sigmaClearAllData",
  "sigmaSetRuntimeMode",
  "sigmaGetRuntimeMode",
  "onSigmaDownloadProgress",
];
