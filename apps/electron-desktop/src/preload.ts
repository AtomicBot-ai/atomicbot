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
  toggleDevTools: () => Promise<void>;
  retry: () => Promise<void>;
  resetAndClose: () => Promise<ResetAndCloseResult>;
  getGatewayInfo: () => Promise<{ state: GatewayState | null }>;
  getConsentInfo: () => Promise<{ accepted: boolean }>;
  acceptConsent: () => Promise<{ ok: true }>;
  startGateway: () => Promise<{ ok: true }>;
  openExternal: (url: string) => Promise<void>;
  setApiKey: (provider: string, apiKey: string) => Promise<{ ok: true }>;
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
  // Auto-updater
  checkForUpdate: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  onUpdateAvailable: (cb: (payload: UpdateAvailablePayload) => void) => () => void;
  onUpdateDownloadProgress: (cb: (payload: UpdateDownloadProgressPayload) => void) => () => void;
  onUpdateDownloaded: (cb: (payload: UpdateDownloadedPayload) => void) => () => void;
  onUpdateError: (cb: (payload: UpdateErrorPayload) => void) => () => void;
};

// Expose only the bare minimum to the renderer. The Control UI is served by the Gateway and
// does not require Electron privileged APIs.
const api: OpenclawDesktopApi = {
  version: "0.0.0",
  openLogs: async () => ipcRenderer.invoke("open-logs"),
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
};

contextBridge.exposeInMainWorld("openclawDesktop", api);
