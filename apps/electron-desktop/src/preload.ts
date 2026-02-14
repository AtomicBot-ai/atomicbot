import { contextBridge, ipcRenderer } from "electron";

import type { GogExecResult } from "./main/gog/types";
import type { GatewayState, ResetAndCloseResult } from "./main/types";

type MemoExecResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  resolvedPath: string | null;
};

type RemindctlExecResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  resolvedPath: string | null;
};

type ObsidianCliExecResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  resolvedPath: string | null;
};

type GhExecResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  resolvedPath: string | null;
};

type UpdateAvailablePayload = {
  version: string;
  releaseDate?: string;
};

type UpdateDownloadProgressPayload = {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
};

type UpdateDownloadedPayload = {
  version: string;
};

type UpdateErrorPayload = {
  message: string;
};

type OpenclawDesktopApi = {
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
  startGateway: () => Promise<{ ok: true }>;
  openExternal: (url: string) => Promise<void>;
  setApiKey: (provider: string, apiKey: string) => Promise<{ ok: true }>;
  validateApiKey: (provider: string, apiKey: string) => Promise<{ valid: boolean; error?: string }>;
  authHasApiKey: (provider: string) => Promise<{ configured: boolean }>;
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
  memoCheck: () => Promise<MemoExecResult>;
  remindctlAuthorize: () => Promise<RemindctlExecResult>;
  remindctlTodayJson: () => Promise<RemindctlExecResult>;
  obsidianCliCheck: () => Promise<ObsidianCliExecResult>;
  obsidianCliPrintDefaultPath: () => Promise<ObsidianCliExecResult>;
  obsidianVaultsList: () => Promise<ObsidianCliExecResult>;
  obsidianCliSetDefault: (params: { vaultName: string }) => Promise<ObsidianCliExecResult>;
  ghCheck: () => Promise<GhExecResult>;
  ghAuthLoginPat: (params: { pat: string }) => Promise<GhExecResult>;
  ghAuthStatus: () => Promise<GhExecResult>;
  ghApiUser: () => Promise<GhExecResult>;
  onGatewayState: (cb: (state: GatewayState) => void) => () => void;
  // OpenClaw config (openclaw.json)
  readConfig: () => Promise<{ ok: boolean; content: string; error?: string }>;
  writeConfig: (content: string) => Promise<{ ok: boolean; error?: string }>;
  // Launch at login (auto-start)
  getLaunchAtLogin: () => Promise<{ enabled: boolean }>;
  setLaunchAtLogin: (enabled: boolean) => Promise<{ ok: true }>;
  // App version
  getAppVersion: () => Promise<{ version: string }>;
  fetchReleaseNotes: (version: string, owner: string, repo: string) => Promise<{ ok: boolean; body: string; htmlUrl: string }>;
  // Auto-updater
  checkForUpdate: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  onUpdateAvailable: (cb: (payload: UpdateAvailablePayload) => void) => () => void;
  onUpdateDownloadProgress: (cb: (payload: UpdateDownloadProgressPayload) => void) => () => void;
  onUpdateDownloaded: (cb: (payload: UpdateDownloadedPayload) => void) => () => void;
  onUpdateError: (cb: (payload: UpdateErrorPayload) => void) => () => void;
  // State directory
  getStateDir: () => Promise<{ stateDir: string }>;
  setStateDirOverride: (stateDir: string) => Promise<{ ok: boolean; needsRestart?: boolean; error?: string }>;
  pickStateDirFolder: () => Promise<{ ok: boolean; path: string }>;
  // Custom skills
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
  // Embedded terminal (PTY) — multi-session
  terminalCreate: () => Promise<{ id: string }>;
  terminalWrite: (id: string, data: string) => Promise<void>;
  terminalResize: (id: string, cols: number, rows: number) => Promise<void>;
  terminalKill: (id: string) => Promise<void>;
  terminalList: () => Promise<Array<{ id: string; alive: boolean }>>;
  terminalGetBuffer: (id: string) => Promise<string>;
  onTerminalData: (cb: (payload: { id: string; data: string }) => void) => () => void;
  onTerminalExit: (cb: (payload: { id: string; exitCode: number; signal?: number }) => void) => () => void;
};

// Expose only the bare minimum to the renderer. The Control UI is served by the Gateway and
// does not require Electron privileged APIs.
const api: OpenclawDesktopApi = {
  version: "0.0.0",
  openLogs: async () => ipcRenderer.invoke("open-logs"),
  openWorkspaceFolder: async () => ipcRenderer.invoke("open-workspace-folder"),
  openOpenclawFolder: async () => ipcRenderer.invoke("open-openclaw-folder"),
  toggleDevTools: async () => ipcRenderer.invoke("devtools-toggle"),
  retry: async () => ipcRenderer.invoke("gateway-retry"),
  resetAndClose: async () => ipcRenderer.invoke("reset-and-close"),
  getGatewayInfo: async () => ipcRenderer.invoke("gateway-get-info"),
  getConsentInfo: async () => ipcRenderer.invoke("consent-get"),
  acceptConsent: async () => ipcRenderer.invoke("consent-accept"),
  startGateway: async () => ipcRenderer.invoke("gateway-start"),
  openExternal: async (url: string) => ipcRenderer.invoke("open-external", { url }),
  setApiKey: async (provider: string, apiKey: string) =>
    ipcRenderer.invoke("auth-set-api-key", { provider, apiKey }),
  validateApiKey: async (provider: string, apiKey: string) =>
    ipcRenderer.invoke("auth-validate-api-key", { provider, apiKey }),
  authHasApiKey: async (provider: string) => ipcRenderer.invoke("auth-has-api-key", { provider }),
  gogAuthList: async () => ipcRenderer.invoke("gog-auth-list"),
  gogAuthAdd: async (params: { account: string; services?: string; noInput?: boolean }) =>
    ipcRenderer.invoke("gog-auth-add", params),
  gogAuthCredentials: async (params: { credentialsJson: string; filename?: string }) =>
    ipcRenderer.invoke("gog-auth-credentials", params),
  memoCheck: async () => ipcRenderer.invoke("memo-check"),
  remindctlAuthorize: async () => ipcRenderer.invoke("remindctl-authorize"),
  remindctlTodayJson: async () => ipcRenderer.invoke("remindctl-today-json"),
  obsidianCliCheck: async () => ipcRenderer.invoke("obsidian-cli-check"),
  obsidianCliPrintDefaultPath: async () => ipcRenderer.invoke("obsidian-cli-print-default-path"),
  obsidianVaultsList: async () => ipcRenderer.invoke("obsidian-vaults-list"),
  obsidianCliSetDefault: async (params: { vaultName: string }) =>
    ipcRenderer.invoke("obsidian-cli-set-default", params),
  ghCheck: async () => ipcRenderer.invoke("gh-check"),
  ghAuthLoginPat: async (params: { pat: string }) =>
    ipcRenderer.invoke("gh-auth-login-pat", params),
  ghAuthStatus: async () => ipcRenderer.invoke("gh-auth-status"),
  ghApiUser: async () => ipcRenderer.invoke("gh-api-user"),
  onGatewayState: (cb: (state: GatewayState) => void) => {
    const handler = (_evt: unknown, state: GatewayState) => cb(state);
    ipcRenderer.on("gateway-state", handler);
    return () => {
      ipcRenderer.removeListener("gateway-state", handler);
    };
  },
  // OpenClaw config (openclaw.json)
  readConfig: async () => ipcRenderer.invoke("config-read"),
  writeConfig: async (content: string) => ipcRenderer.invoke("config-write", { content }),
  // Launch at login (auto-start)
  getLaunchAtLogin: async () => ipcRenderer.invoke("launch-at-login-get"),
  setLaunchAtLogin: async (enabled: boolean) =>
    ipcRenderer.invoke("launch-at-login-set", { enabled }),
  // App version
  getAppVersion: async () => ipcRenderer.invoke("get-app-version"),
  fetchReleaseNotes: async (version: string, owner: string, repo: string) =>
    ipcRenderer.invoke("fetch-release-notes", { version, owner, repo }),
  // Auto-updater
  checkForUpdate: async () => ipcRenderer.invoke("updater-check"),
  downloadUpdate: async () => ipcRenderer.invoke("updater-download"),
  installUpdate: async () => ipcRenderer.invoke("updater-install"),
  onUpdateAvailable: (cb: (payload: UpdateAvailablePayload) => void) => {
    const handler = (_evt: unknown, payload: UpdateAvailablePayload) => cb(payload);
    ipcRenderer.on("updater-available", handler);
    return () => {
      ipcRenderer.removeListener("updater-available", handler);
    };
  },
  onUpdateDownloadProgress: (cb: (payload: UpdateDownloadProgressPayload) => void) => {
    const handler = (_evt: unknown, payload: UpdateDownloadProgressPayload) => cb(payload);
    ipcRenderer.on("updater-download-progress", handler);
    return () => {
      ipcRenderer.removeListener("updater-download-progress", handler);
    };
  },
  onUpdateDownloaded: (cb: (payload: UpdateDownloadedPayload) => void) => {
    const handler = (_evt: unknown, payload: UpdateDownloadedPayload) => cb(payload);
    ipcRenderer.on("updater-downloaded", handler);
    return () => {
      ipcRenderer.removeListener("updater-downloaded", handler);
    };
  },
  onUpdateError: (cb: (payload: UpdateErrorPayload) => void) => {
    const handler = (_evt: unknown, payload: UpdateErrorPayload) => cb(payload);
    ipcRenderer.on("updater-error", handler);
    return () => {
      ipcRenderer.removeListener("updater-error", handler);
    };
  },
  // State directory
  getStateDir: async () => ipcRenderer.invoke("get-state-dir"),
  setStateDirOverride: async (stateDir: string) =>
    ipcRenderer.invoke("set-state-dir-override", { stateDir }),
  pickStateDirFolder: async () => ipcRenderer.invoke("pick-state-dir-folder"),
  // Custom skills
  installCustomSkill: async (data: string) => ipcRenderer.invoke("install-custom-skill", { data }),
  listCustomSkills: async () => ipcRenderer.invoke("list-custom-skills"),
  removeCustomSkill: async (dirName: string) =>
    ipcRenderer.invoke("remove-custom-skill", { dirName }),
  // Embedded terminal (PTY) — multi-session
  terminalCreate: async () => ipcRenderer.invoke("terminal:create"),
  terminalWrite: async (id: string, data: string) =>
    ipcRenderer.invoke("terminal:write", { id, data }),
  terminalResize: async (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke("terminal:resize", { id, cols, rows }),
  terminalKill: async (id: string) => ipcRenderer.invoke("terminal:kill", { id }),
  terminalList: async () => ipcRenderer.invoke("terminal:list"),
  terminalGetBuffer: async (id: string) => ipcRenderer.invoke("terminal:get-buffer", { id }),
  onTerminalData: (cb: (payload: { id: string; data: string }) => void) => {
    const handler = (_evt: unknown, payload: { id: string; data: string }) => cb(payload);
    ipcRenderer.on("terminal:data", handler);
    return () => {
      ipcRenderer.removeListener("terminal:data", handler);
    };
  },
  onTerminalExit: (cb: (payload: { id: string; exitCode: number; signal?: number }) => void) => {
    const handler = (_evt: unknown, payload: { id: string; exitCode: number; signal?: number }) =>
      cb(payload);
    ipcRenderer.on("terminal:exit", handler);
    return () => {
      ipcRenderer.removeListener("terminal:exit", handler);
    };
  },
};

contextBridge.exposeInMainWorld("openclawDesktop", api);
