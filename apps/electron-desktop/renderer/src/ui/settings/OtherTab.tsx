import React from "react";
import { useNavigate } from "react-router-dom";

import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { useGatewayRpc } from "@gateway/context";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { authActions, clearAuth, persistMode } from "@store/slices/auth/authSlice";
import { reloadConfig } from "@store/slices/configSlice";
import { errorToMessage } from "@shared/toast";
import { ConfirmDialog } from "@shared/kit";
import { routes } from "../app/routes";
import { settingsStyles as ps } from "./SettingsPage";
import { openExternal } from "@shared/utils/openExternal";
import { RestoreBackupModal } from "./RestoreBackupModal";
import s from "./OtherTab.module.css";
import pkg from "../../../../package.json";

type UpdateCheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; version: string }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "ready"; version: string }
  | { kind: "up-to-date" }
  | { kind: "error"; message: string };

export function OtherTab({ onError }: { onError: (msg: string | null) => void }) {
  const [launchAtStartup, setLaunchAtStartup] = React.useState(false);
  const [resetBusy, setResetBusy] = React.useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = React.useState(false);
  const [backupBusy, setBackupBusy] = React.useState(false);
  const [restoreModalOpen, setRestoreModalOpen] = React.useState(false);
  const [updateCheck, setUpdateCheck] = React.useState<UpdateCheckState>({ kind: "idle" });
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const gw = useGatewayRpc();
  const authMode = useAppSelector((st) => st.auth.mode);

  const appVersion = pkg.version || "0.0.0";

  React.useEffect(() => {
    const api = getDesktopApiOrNull();
    if (!api?.getLaunchAtLogin) {
      return;
    }
    void api.getLaunchAtLogin().then((res) => setLaunchAtStartup(res.enabled));
  }, []);

  React.useEffect(() => {
    const api = getDesktopApiOrNull();
    if (!api) {
      return;
    }
    const unsubs: Array<() => void> = [];
    unsubs.push(
      api.onUpdateAvailable((payload) => {
        setUpdateCheck({ kind: "available", version: payload.version });
      })
    );
    unsubs.push(
      api.onUpdateNotAvailable(() => {
        setUpdateCheck({ kind: "up-to-date" });
        setTimeout(
          () => setUpdateCheck((prev) => (prev.kind === "up-to-date" ? { kind: "idle" } : prev)),
          5000
        );
      })
    );
    unsubs.push(
      api.onUpdateDownloadProgress((payload) => {
        setUpdateCheck((prev) => {
          const ver = prev.kind === "available" || prev.kind === "downloading" ? prev.version : "";
          return { kind: "downloading", version: ver, percent: Math.round(payload.percent) };
        });
      })
    );
    unsubs.push(
      api.onUpdateDownloaded((payload) => {
        setUpdateCheck({ kind: "ready", version: payload.version });
      })
    );
    unsubs.push(
      api.onUpdateError((payload) => {
        setUpdateCheck((prev) => {
          if (prev.kind === "checking" || prev.kind === "downloading") {
            return { kind: "error", message: payload.message };
          }
          return prev;
        });
      })
    );
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, []);

  const handleCheckForUpdates = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    if (!api?.checkForUpdate) {
      onError("Desktop API not available");
      return;
    }
    setUpdateCheck({ kind: "checking" });
    try {
      await api.checkForUpdate();
    } catch (err) {
      setUpdateCheck({ kind: "error", message: errorToMessage(err) });
    }
  }, [onError]);

  const handleDownloadUpdate = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    if (!api?.downloadUpdate) return;
    try {
      await api.downloadUpdate();
    } catch (err) {
      setUpdateCheck({ kind: "error", message: errorToMessage(err) });
    }
  }, []);

  const handleInstallUpdate = React.useCallback(() => {
    const api = getDesktopApiOrNull();
    if (!api?.installUpdate) return;
    void api.installUpdate();
  }, []);

  const toggleLaunchAtStartup = React.useCallback(
    async (enabled: boolean) => {
      const api = getDesktopApiOrNull();
      if (!api?.setLaunchAtLogin) {
        onError("Desktop API not available");
        return;
      }
      setLaunchAtStartup(enabled);
      try {
        await api.setLaunchAtLogin(enabled);
      } catch (err) {
        setLaunchAtStartup(!enabled);
        onError(errorToMessage(err));
      }
    },
    [onError]
  );

  const confirmResetAndClose = React.useCallback(async () => {
    setResetConfirmOpen(false);
    const api = getDesktopApiOrNull();
    if (!api) {
      onError("Desktop API not available");
      return;
    }
    onError(null);
    setResetBusy(true);
    try {
      await api.resetAndClose();
    } catch (err) {
      onError(errorToMessage(err));
      setResetBusy(false);
    }
  }, [onError]);

  const handleCreateBackup = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    if (!api?.createBackup) {
      onError("Desktop API not available");
      return;
    }
    onError(null);
    setBackupBusy(true);
    try {
      const result = await api.createBackup(authMode ?? undefined);
      if (!result.ok && !result.cancelled) {
        onError(result.error || "Failed to create backup");
      }
    } catch (err) {
      onError(errorToMessage(err));
    } finally {
      setBackupBusy(false);
    }
  }, [onError, authMode]);

  const handleRestored = React.useCallback(
    (meta?: { mode?: string }) => {
      dispatch(authActions.clearAuthState());
      void dispatch(clearAuth());

      const restoredMode =
        meta?.mode === "paid" || meta?.mode === "self-managed" ? meta.mode : "self-managed";
      dispatch(authActions.setMode(restoredMode));
      persistMode(restoredMode);

      setRestoreModalOpen(false);
      if (restoredMode === "paid") {
        navigate(`${routes.settings}/account`);
      } else {
        navigate(routes.chat);
      }
    },
    [navigate, dispatch]
  );

  const api = getDesktopApiOrNull();

  return (
    <div className={ps.UiSettingsContentInner}>
      {/* App & About (combined) */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>App</h3>
        <div className={s.UiSettingsOtherCard}>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Version</span>
            <span className={s.UiSettingsOtherAppRowValue}>Sigma Eclipse v{appVersion}</span>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Auto start</span>
            <span className={s.UiSettingsOtherAppRowValue}>
              <label className={s.UiSettingsOtherToggle} aria-label="Launch at startup">
                <input
                  type="checkbox"
                  checked={launchAtStartup}
                  onChange={(e) => void toggleLaunchAtStartup(e.target.checked)}
                />
                <span className={s.UiSettingsOtherToggleTrack}>
                  <span className={s.UiSettingsOtherToggleThumb} />
                </span>
              </label>
            </span>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>License</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              onClick={() =>
                openExternal("https://polyformproject.org/licenses/noncommercial/1.0.0")
              }
            >
              PolyForm Noncommercial 1.0.0
            </button>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Updates</span>
            <span className={s.UiSettingsOtherAppRowValue}>
              {updateCheck.kind === "idle" && (
                <button
                  type="button"
                  className={s.UiSettingsOtherLink}
                  onClick={() => void handleCheckForUpdates()}
                >
                  Check for updates
                </button>
              )}
              {updateCheck.kind === "checking" && (
                <span className={s.UiSettingsOtherRowValue}>Checking…</span>
              )}
              {updateCheck.kind === "up-to-date" && (
                <span className={s.UiSettingsOtherRowValue}>You're up to date</span>
              )}
              {updateCheck.kind === "available" && (
                <button
                  type="button"
                  className={s.UiSettingsOtherLink}
                  onClick={() => void handleDownloadUpdate()}
                >
                  Download v{updateCheck.version}
                </button>
              )}
              {updateCheck.kind === "downloading" && (
                <span className={s.UiSettingsOtherRowValue}>
                  Downloading… {updateCheck.percent}%
                </span>
              )}
              {updateCheck.kind === "ready" && (
                <button
                  type="button"
                  className={s.UiSettingsOtherLink}
                  onClick={handleInstallUpdate}
                >
                  Restart &amp; Update
                </button>
              )}
              {updateCheck.kind === "error" && (
                <button
                  type="button"
                  className={s.UiSettingsOtherLink}
                  onClick={() => void handleCheckForUpdates()}
                  title={updateCheck.message}
                >
                  Retry
                </button>
              )}
            </span>
          </div>
        </div>
      </section>

      {/* Backup */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>Backup</h3>
        <div className={s.UiSettingsOtherCard}>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Create backup</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              disabled={backupBusy}
              onClick={() => void handleCreateBackup()}
            >
              {backupBusy ? "Creating..." : "Save to file"}
            </button>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Restore from backup</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              onClick={() => setRestoreModalOpen(true)}
            >
              Choose file
            </button>
          </div>
        </div>
        <p className={s.UiSettingsOtherHint}>
          Create a full backup of your OpenClaw configuration or restore from a previously saved
          backup.
        </p>
      </section>

      <RestoreBackupModal
        open={restoreModalOpen}
        onClose={() => setRestoreModalOpen(false)}
        onRestored={handleRestored}
      />

      {/* Folders: OpenClaw data + Agent workspace */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>Folders</h3>
        <div className={s.UiSettingsOtherCard}>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>OpenClaw folder</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              onClick={() => void api?.openOpenclawFolder()}
            >
              Open folder
            </button>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Agent workspace</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              onClick={() => void api?.openWorkspaceFolder()}
            >
              Open folder
            </button>
          </div>
        </div>
        <p className={s.UiSettingsOtherHint}>
          Contains your local OpenClaw state and app data. Workspace contains editable .md files
          (AGENTS, SOUL, USER, IDENTITY, TOOLS, HEARTBEAT, BOOTSTRAP) that shape the agent.
        </p>
      </section>

      {/* Danger zone (reset) */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>Account</h3>
        <p className={s.UiSettingsOtherDangerSubtitle}>
          This will wipe the app's local state and remove all Google Workspace authorizations. The
          app will restart.
        </p>
        <div className={`${s.UiSettingsOtherCard} ${s["UiSettingsOtherCard--danger"]}`}>
          <div className={s.UiSettingsOtherRow}>
            <button
              type="button"
              className={s.UiSettingsOtherDangerButton}
              disabled={resetBusy}
              onClick={() => setResetConfirmOpen(true)}
            >
              {resetBusy ? "Resetting..." : "Reset and sign out"}
            </button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={resetConfirmOpen}
        title="Reset and sign out?"
        subtitle="All local data will be deleted and Google Workspace will be disconnected. The app will close and you'll need to set it up again."
        confirmLabel="Reset"
        danger
        onConfirm={() => void confirmResetAndClose()}
        onCancel={() => setResetConfirmOpen(false)}
      />
    </div>
  );
}
