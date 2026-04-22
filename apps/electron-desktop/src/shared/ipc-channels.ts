/**
 * Single source of truth for all IPC channel names.
 * Used by both preload (renderer bridge) and main-process handlers.
 */

export const IPC = {
  // File / window operations
  openLogs: "open-logs",
  openWorkspaceFolder: "open-workspace-folder",
  openOpenclawFolder: "open-openclaw-folder",
  devtoolsToggle: "devtools-toggle",
  openExternal: "open-external",
  focusWindow: "focus-window",

  // Gateway / consent / app lifecycle
  gatewayGetInfo: "gateway-get-info",
  consentGet: "consent-get",
  consentAccept: "consent-accept",
  onboardingSetState: "onboarding-set-state",
  gatewayStart: "gateway-start",
  gatewayRetry: "gateway-retry",

  // Auth / keys
  authSetApiKey: "auth-set-api-key",
  authSetSetupToken: "auth-set-setup-token",
  authSetSetupModeMarker: "auth-set-setup-mode-marker",
  authValidateApiKey: "auth-validate-api-key",
  authHasApiKey: "auth-has-api-key",
  authReadProfiles: "auth-read-profiles",
  authWriteProfiles: "auth-write-profiles",

  // OAuth
  oauthLogin: "oauth:login",

  // Memo
  memoCheck: "memo-check",

  // Remindctl
  remindctlAuthorize: "remindctl-authorize",
  remindctlTodayJson: "remindctl-today-json",

  // Obsidian
  obsidianCliCheck: "obsidian-cli-check",
  obsidianCliPrintDefaultPath: "obsidian-cli-print-default-path",
  obsidianVaultsList: "obsidian-vaults-list",
  obsidianCliSetDefault: "obsidian-cli-set-default",

  // GitHub CLI
  ghCheck: "gh-check",
  ghAuthLoginPat: "gh-auth-login-pat",
  ghAuthStatus: "gh-auth-status",
  ghApiUser: "gh-api-user",

  // Config
  configRead: "config-read",
  configWrite: "config-write",
  launchAtLoginGet: "launch-at-login-get",
  launchAtLoginSet: "launch-at-login-set",
  getAppVersion: "get-app-version",

  // Updater
  fetchReleaseNotes: "fetch-release-notes",
  updaterCheck: "updater-check",
  updaterDownload: "updater-download",
  updaterInstall: "updater-install",

  // Backup & restore
  backupCreate: "backup-create",
  backupRestore: "backup-restore",
  backupRestoreFromFile: "backup-restore-from-file",
  backupDetectLocal: "backup-detect-local",
  backupRestoreFromDir: "backup-restore-from-dir",
  backupSelectFolder: "backup-select-folder",

  // Custom skills
  installCustomSkill: "install-custom-skill",
  listCustomSkills: "list-custom-skills",
  removeCustomSkill: "remove-custom-skill",

  // ClawHub (skill registry)
  clawhubListSkills: "clawhub-list-skills",
  clawhubGetSkillPackage: "clawhub-get-skill-package",
  clawhubGetSkillFile: "clawhub-get-skill-file",
  clawhubGetComments: "clawhub-get-comments",

  // Gog (Google Workspace)
  gogAuthList: "gog-auth-list",
  gogAuthAdd: "gog-auth-add",
  gogAuthCredentials: "gog-auth-credentials",

  // Whisper (voice transcription)
  whisperModelStatus: "whisper-model-status",
  whisperModelDownload: "whisper-model-download",
  whisperModelDownloadCancel: "whisper-model-download-cancel",
  whisperSetGatewayModel: "whisper-set-gateway-model",
  whisperModelsList: "whisper-models-list",
  whisperTranscribe: "whisper-transcribe",

  // Windows Defender
  defenderStatus: "defender-status",
  defenderApplyExclusions: "defender-apply-exclusions",
  defenderDismiss: "defender-dismiss",

  // Analytics (consent state + opt-in/opt-out)
  analyticsGet: "analytics-get",
  analyticsSet: "analytics-set",

  // Extra models (desktop-only model injection for the picker)
  extraModels: "extra-models",

  // Llamacpp (local models)
  llamacppSystemInfo: "llamacpp-system-info",
  llamacppBackendStatus: "llamacpp-backend-status",
  llamacppBackendDownload: "llamacpp-backend-download",
  llamacppBackendDownloadCancel: "llamacpp-backend-download-cancel",
  llamacppBackendUpdate: "llamacpp-backend-update",
  llamacppModelStatus: "llamacpp-model-status",
  llamacppModelDownload: "llamacpp-model-download",
  llamacppModelDownloadCancel: "llamacpp-model-download-cancel",
  llamacppModelDelete: "llamacpp-model-delete",
  llamacppModelsList: "llamacpp-models-list",
  llamacppServerStart: "llamacpp-server-start",
  llamacppServerStop: "llamacpp-server-stop",
  llamacppClearActiveModel: "llamacpp-clear-active-model",
  llamacppServerStatus: "llamacpp-server-status",
  llamacppSetActiveModel: "llamacpp-set-active-model",
  llamacppWarmupGet: "llamacpp-warmup-get",
  llamacppWarmupSet: "llamacpp-warmup-set",

  // Reset
  resetAndClose: "reset-and-close",

  // System notifications (background alerts for agent events)
  notificationsShow: "notifications:show",

  // Terminal (PTY)
  terminalCreate: "terminal:create",
  terminalWrite: "terminal:write",
  terminalResize: "terminal:resize",
  terminalKill: "terminal:kill",
  terminalList: "terminal:list",
  terminalGetBuffer: "terminal:get-buffer",
} as const;

/** Event channels (main -> renderer, via webContents.send / ipcRenderer.on). */
export const IPC_EVENTS = {
  gatewayState: "gateway-state",
  oauthProgress: "oauth:progress",
  updaterAvailable: "updater-available",
  updaterDownloadProgress: "updater-download-progress",
  updaterDownloaded: "updater-downloaded",
  updaterError: "updater-error",
  whisperModelDownloadProgress: "whisper-model-download-progress",
  llamacppBackendDownloadProgress: "llamacpp-backend-download-progress",
  llamacppModelDownloadProgress: "llamacpp-model-download-progress",
  deepLink: "deep-link",
  terminalData: "terminal:data",
  terminalExit: "terminal:exit",
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
export type IpcEventChannel = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];
