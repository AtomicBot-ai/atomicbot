/**
 * Shared parameter type for IPC handler registration functions.
 * Each handler module uses a narrowed Pick of this type so that
 * only the fields it actually needs are visible in its signature.
 */
import type { BrowserWindow } from "electron";
import type { BinaryPaths, GatewayState } from "../types";

export type RegisterParams = BinaryPaths & {
  getMainWindow: () => BrowserWindow | null;
  getGatewayState: () => GatewayState | null;
  getLogsDir: () => string | null;
  getConsentAccepted: () => boolean;
  acceptConsent: () => Promise<void>;
  getOnboarded: () => boolean;
  setOnboarded: (onboarded: boolean) => void;
  startGateway: (opts?: { silent?: boolean }) => Promise<void>;
  userData: string;
  stateDir: string;
  logsDir: string;
  openclawDir: string;
  whisperDataDir: string;
  stopGatewayChild: () => Promise<void>;
  getGatewayToken: () => string;
  setGatewayToken: (token: string) => void;
};

/** Narrowed params for each IPC handler module. */
export type FileHandlerParams = Pick<RegisterParams, "getLogsDir" | "stateDir" | "getMainWindow">;
export type KeyHandlerParams = Pick<RegisterParams, "stateDir">;
export type MemoHandlerParams = Pick<RegisterParams, "memoBin" | "openclawDir">;
export type RemindctlHandlerParams = Pick<RegisterParams, "remindctlBin" | "openclawDir">;
export type ObsidianHandlerParams = Pick<RegisterParams, "obsidianCliBin" | "openclawDir">;
export type GhHandlerParams = Pick<RegisterParams, "ghBin" | "stateDir" | "openclawDir">;
export type ConfigHandlerParams = Pick<
  RegisterParams,
  | "getGatewayState"
  | "getConsentAccepted"
  | "acceptConsent"
  | "startGateway"
  | "stateDir"
  | "getOnboarded"
  | "setOnboarded"
>;
export type OAuthHandlerParams = Pick<RegisterParams, "getMainWindow" | "stateDir">;
export type SkillHandlerParams = Pick<RegisterParams, "stateDir">;
export type BackupHandlerParams = Pick<
  RegisterParams,
  | "stateDir"
  | "stopGatewayChild"
  | "startGateway"
  | "getMainWindow"
  | "setGatewayToken"
  | "acceptConsent"
>;
export type DefenderHandlerParams = Pick<RegisterParams, "stateDir">;
export type WhisperHandlerParams = Pick<
  RegisterParams,
  | "whisperCliBin"
  | "whisperDataDir"
  | "getMainWindow"
  | "stateDir"
  | "stopGatewayChild"
  | "startGateway"
>;
export type GogHandlerParams = Pick<
  RegisterParams,
  "gogBin" | "openclawDir" | "userData" | "stateDir"
>;
export type ResetHandlerParams = Pick<
  RegisterParams,
  | "userData"
  | "stateDir"
  | "logsDir"
  | "whisperDataDir"
  | "gogBin"
  | "openclawDir"
  | "stopGatewayChild"
>;
