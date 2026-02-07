import type { GogExecResult } from "../../src/main/gog/types";
import type { GatewayState, ResetAndCloseResult } from "../../src/main/types";

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

declare global {
  interface Window {
    openclawDesktop?: {
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
      onUpdateDownloadProgress: (
        cb: (payload: UpdateDownloadProgressPayload) => void
      ) => () => void;
      onUpdateDownloaded: (cb: (payload: UpdateDownloadedPayload) => void) => () => void;
      onUpdateError: (cb: (payload: UpdateErrorPayload) => void) => () => void;
    };
  }
}
