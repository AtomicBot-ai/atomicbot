import type { GogExecResult } from "../main/gog/types";
import type { GatewayState, ResetAndCloseResult } from "../main/types";
import type { ExecResult } from "./types";

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

export type DesktopPlatform = "darwin" | "win32" | "linux";
export type SetupModeMarker = "paid" | "self-managed" | "local-model";

export type ClawHubBadges = {
  highlighted: boolean;
  official: boolean;
  deprecated: boolean;
};

export type ClawHubStats = {
  downloads: number;
  installsCurrent: number;
  installsAllTime: number;
  stars: number;
  versions: number;
  comments: number;
};

export type ClawHubOwner = {
  handle: string;
  displayName: string;
  image?: string;
  kind: string;
};

export type ClawHubVersion = {
  version: string;
  createdAt: number;
  changelog?: string;
  changelogSource?: string | null;
};

export type ClawHubSkillListEntry = {
  slug: string;
  displayName: string;
  summary?: string;
  emoji?: string | null;
  badges: ClawHubBadges;
  stats: ClawHubStats;
  owner?: ClawHubOwner | null;
  latestVersion?: ClawHubVersion | null;
  createdAt: number;
  updatedAt: number;
};

export type ClawHubFileEntry = {
  path: string;
  size: number;
  sha256?: string;
  contentType?: string;
};

export type ClawHubModeration = {
  isPendingScan: boolean;
  isMalwareBlocked: boolean;
  isSuspicious: boolean;
  isHiddenByMod: boolean;
  isRemoved: boolean;
  verdict?: string | null;
  reasonCodes: string[];
  summary?: string | null;
};

export type ClawHubVtAnalysis = {
  status: string;
  verdict: string;
  analysis?: string | null;
  source?: string | null;
  checkedAt: number;
};

export type ClawHubLlmDimension = {
  name: string;
  label: string;
  rating: string;
  detail: string;
};

export type ClawHubLlmAnalysis = {
  status: string;
  verdict: string;
  confidence: string;
  summary?: string | null;
  guidance?: string | null;
  model?: string | null;
  checkedAt: number;
  dimensions?: ClawHubLlmDimension[] | null;
};

export type ClawHubSkillPackageDetail = {
  slug: string;
  displayName: string;
  summary?: string;
  emoji?: string | null;
  badges: ClawHubBadges;
  stats: ClawHubStats;
  owner?: ClawHubOwner | null;
  latestVersion?: ClawHubVersion | null;
  createdAt: number;
  updatedAt: number;
  sourceId?: string;
  license?: string | null;
  platforms?: string[] | null;
  files?: ClawHubFileEntry[] | null;
  moderation?: ClawHubModeration | null;
  vtAnalysis?: ClawHubVtAnalysis | null;
  llmAnalysis?: ClawHubLlmAnalysis | null;
  tags?: Record<string, string> | null;
  forkOf?: { skillId: string; kind: string; version?: string | null } | null;
  canonicalSkillId?: string | null;
  syncedAt?: string;
  detailSyncedAt?: string | null;
};

export type ClawHubCommentUser = {
  handle: string;
  displayName: string;
  image?: string;
};

export type ClawHubComment = {
  id: string;
  user: ClawHubCommentUser;
  body: string;
  createdAt: number;
};

export interface DesktopCoreApi {
  platform: DesktopPlatform;
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
  setOnboardingState: (onboarded: boolean) => Promise<{ ok: true }>;
  startGateway: () => Promise<{ ok: true }>;
  openExternal: (url: string) => Promise<void>;
  extraModels: () => Promise<
    Array<{
      id: string;
      name: string;
      provider: string;
      contextWindow?: number;
      reasoning?: boolean;
    }>
  >;
  readConfig: () => Promise<{ ok: boolean; content: string; error?: string }>;
  writeConfig: (content: string) => Promise<{ ok: boolean; error?: string }>;
  getLaunchAtLogin: () => Promise<{ enabled: boolean }>;
  setLaunchAtLogin: (enabled: boolean) => Promise<{ ok: true }>;
  getAppVersion: () => Promise<{ version: string }>;
  focusWindow: () => Promise<void>;
  onGatewayState: (cb: (state: GatewayState) => void) => () => void;
  onDeepLink: (
    cb: (payload: { host: string; pathname: string; params: Record<string, string> }) => void
  ) => () => void;
}

export interface DesktopAuthApi {
  setApiKey: (provider: string, apiKey: string) => Promise<{ ok: true }>;
  setSetupToken: (provider: string, token: string) => Promise<{ ok: true }>;
  setSetupModeMarker: (mode?: SetupModeMarker) => Promise<{ ok: true }>;
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
}

export interface DesktopGogApi {
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
}

export interface DesktopToolsApi {
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
}

export interface DesktopUpdateApi {
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
}

export interface DesktopBackupApi {
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
}

export interface DesktopSkillsApi {
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
}

export interface DesktopClawHubApi {
  clawhubListSkills: (params?: {
    q?: string;
    limit?: number;
    page?: number;
    sort?: string;
    dir?: string;
    nonSuspicious?: boolean;
  }) => Promise<{
    ok: boolean;
    items: ClawHubSkillListEntry[];
    total: number;
    page: number;
    totalPages: number;
    error?: string;
  }>;
  clawhubGetSkillPackage: (params: { slug: string }) => Promise<{
    ok: boolean;
    package?: ClawHubSkillPackageDetail;
    error?: string;
  }>;
  clawhubGetSkillFile: (params: { slug: string; path: string }) => Promise<{
    ok: boolean;
    content?: string;
    error?: string;
  }>;
  clawhubGetComments: (params: { slug: string; limit?: number }) => Promise<{
    ok: boolean;
    comments: ClawHubComment[];
    error?: string;
  }>;
}

export interface DesktopLlamacppApi {
  llamacppSystemInfo: () => Promise<{
    totalRamGb: number;
    arch: string;
    platform: string;
    isAppleSilicon: boolean;
    models: Array<{ id: string; name: string; compatibility: string }>;
  }>;
  llamacppBackendStatus: () => Promise<{
    downloaded: boolean;
    version: string | null;
    downloadedAt: string | null;
  }>;
  llamacppBackendDownload: () => Promise<{ ok: boolean; tag?: string; error?: string }>;
  llamacppBackendDownloadCancel: () => Promise<{ ok: boolean }>;
  llamacppBackendUpdate: () => Promise<{
    ok: boolean;
    updateAvailable?: boolean;
    latestTag?: string;
    currentTag?: string | null;
    error?: string;
  }>;
  llamacppModelStatus: (params?: { model?: string }) => Promise<{
    downloaded: boolean;
    modelPath: string;
    size: number;
    modelId: string;
  }>;
  llamacppModelDownload: (params?: { model?: string }) => Promise<{
    ok: boolean;
    modelPath?: string;
    error?: string;
  }>;
  llamacppModelDownloadCancel: () => Promise<{ ok: boolean }>;
  onLlamacppBackendDownloadProgress: (
    cb: (payload: { percent: number; transferred: number; total: number }) => void
  ) => () => void;
  onLlamacppModelDownloadProgress: (
    cb: (payload: { percent: number; transferred: number; total: number; modelId: string }) => void
  ) => () => void;
  llamacppModelsList: () => Promise<
    Array<{
      id: string;
      name: string;
      description: string;
      sizeLabel: string;
      contextLabel: string;
      downloaded: boolean;
      size: number;
      compatibility: string;
      icon: string;
      tag?: string;
    }>
  >;
  llamacppModelDelete: (params: { model: string }) => Promise<{
    ok: boolean;
    error?: string;
  }>;
  llamacppServerStart: (params?: { model?: string }) => Promise<{
    ok: boolean;
    port?: number;
    modelId?: string;
    modelName?: string;
    contextLength?: number;
    error?: string;
  }>;
  llamacppServerStop: () => Promise<{ ok: boolean; error?: string }>;
  llamacppClearActiveModel: () => Promise<{ ok: boolean; error?: string }>;
  llamacppServerStatus: () => Promise<{
    running: boolean;
    modelPath: string | null;
    port: number;
    healthy: boolean;
    loading: boolean;
    activeModelId: string | null;
  }>;
  llamacppSetActiveModel: (params: { model: string }) => Promise<{
    ok: boolean;
    port?: number;
    modelId?: string;
    modelName?: string;
    contextLength?: number;
    error?: string;
  }>;
  llamacppWarmupGet: () => Promise<{ state: "idle" | "warming" | "done"; modelId: string | null }>;
  llamacppWarmupSet: (params: {
    state: "idle" | "warming" | "done";
    modelId: string | null;
  }) => Promise<{ ok: boolean }>;
}

export interface DesktopWhisperApi {
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
}

export interface DesktopTerminalApi {
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
}

export interface DesktopAnalyticsApi {
  analyticsGet: () => Promise<{ enabled: boolean; userId: string; prompted: boolean }>;
  analyticsSet: (enabled: boolean) => Promise<{ ok: true }>;
}

export interface DesktopDefenderApi {
  defenderStatus: () => Promise<{ applied: boolean; dismissed: boolean; isWindows: boolean }>;
  defenderApplyExclusions: () => Promise<{ ok: boolean; error?: string }>;
  defenderDismiss: () => Promise<{ ok: boolean }>;
}

export type NotificationsShowParams = {
  title: string;
  body: string;
  /** When true, the notification is only shown if the main window is not focused or not visible. */
  onlyIfBackgrounded?: boolean;
};

export type NotificationsShowResult = {
  /** true if a system notification was actually shown, false if suppressed (window focused). */
  shown: boolean;
};

export interface DesktopNotificationsApi {
  showNotification: (params: NotificationsShowParams) => Promise<NotificationsShowResult>;
}

export type OpenclawDesktopApi = DesktopCoreApi &
  DesktopAuthApi &
  DesktopGogApi &
  DesktopToolsApi &
  DesktopUpdateApi &
  DesktopBackupApi &
  DesktopSkillsApi &
  DesktopClawHubApi &
  DesktopLlamacppApi &
  DesktopWhisperApi &
  DesktopTerminalApi &
  DesktopAnalyticsApi &
  DesktopDefenderApi &
  DesktopNotificationsApi;

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
  "setOnboardingState",
  "startGateway",
  "openExternal",
  "extraModels",
  "setApiKey",
  "setSetupToken",
  "setSetupModeMarker",
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
  "clawhubListSkills",
  "clawhubGetSkillPackage",
  "clawhubGetSkillFile",
  "clawhubGetComments",
  "defenderStatus",
  "defenderApplyExclusions",
  "defenderDismiss",
  "terminalCreate",
  "terminalWrite",
  "terminalResize",
  "terminalKill",
  "terminalList",
  "terminalGetBuffer",
  "llamacppSystemInfo",
  "llamacppBackendStatus",
  "llamacppBackendDownload",
  "llamacppBackendDownloadCancel",
  "llamacppBackendUpdate",
  "llamacppModelStatus",
  "llamacppModelDownload",
  "llamacppModelDownloadCancel",
  "llamacppModelDelete",
  "onLlamacppBackendDownloadProgress",
  "onLlamacppModelDownloadProgress",
  "llamacppModelsList",
  "llamacppServerStart",
  "llamacppServerStop",
  "llamacppClearActiveModel",
  "llamacppServerStatus",
  "llamacppSetActiveModel",
  "llamacppWarmupGet",
  "llamacppWarmupSet",
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
  "analyticsGet",
  "analyticsSet",
  "showNotification",
];

type AssertExhaustive<T extends readonly (keyof OpenclawDesktopApi)[]> = Exclude<
  keyof OpenclawDesktopApi,
  T[number]
> extends never
  ? T
  : never;

const _bridgeKeysCheck: AssertExhaustive<typeof DESKTOP_BRIDGE_KEYS> = DESKTOP_BRIDGE_KEYS;
