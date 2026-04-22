import React from "react";
import { useNavigate } from "react-router-dom";

import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { GlassCard, HeroPageLayout } from "@shared/kit";
import { errorToMessage } from "@shared/toast";
import { fileToBase64 } from "@shared/utils/base64";
import { useAppDispatch } from "@store/hooks";
import { setOnboarded } from "@store/slices/onboardingSlice";
import { authActions, clearAuth, persistMode } from "@store/slices/auth/authSlice";
import { routes } from "../app/routes";
import { OnboardingHeader } from "./OnboardingHeader";
import s from "./RestoreFilePage.module.css";

type PageState = "idle" | "loading" | "error";

export function RestoreFilePage(props: { totalSteps: number; activeStep: number }) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [pageState, setPageState] = React.useState<PageState>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = React.useCallback(
    async (file: File) => {
      const lower = file.name.toLowerCase();
      const supported =
        lower.endsWith(".zip") || lower.endsWith(".tar.gz") || lower.endsWith(".tgz");
      if (!supported) {
        setError("Please upload a .zip or .tar.gz file");
        setPageState("error");
        return;
      }

      setPageState("loading");
      setError(null);

      try {
        const api = getDesktopApiOrNull();
        if (!api?.restoreBackup) {
          throw new Error("API not available");
        }

        const filePath = api.getPathForFile ? api.getPathForFile(file) : "";
        let result: { ok: boolean; error?: string; meta?: { mode?: string } };
        if (filePath && api.restoreBackupFromFile) {
          result = await api.restoreBackupFromFile(filePath, file.name);
        } else {
          const base64 = await fileToBase64(file);
          result = await api.restoreBackup(base64, file.name);
        }
        if (!result.ok) {
          throw new Error(result.error || "Restore failed");
        }

        dispatch(authActions.clearAuthState());
        void dispatch(clearAuth());

        const restoredMode =
          result.meta?.mode === "paid" || result.meta?.mode === "self-managed"
            ? result.meta.mode
            : "self-managed";
        dispatch(authActions.setMode(restoredMode));
        persistMode(restoredMode);
        void dispatch(setOnboarded(true));
        void navigate(routes.chat, { replace: true });
      } catch (err) {
        setError(errorToMessage(err));
        setPageState("error");
      }
    },
    [navigate, dispatch]
  );

  const onDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        void handleFile(file);
      }
    },
    [handleFile]
  );

  const onDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDragEnter = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const onDragLeave = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const onFileInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        void handleFile(file);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [handleFile]
  );

  const openFilePicker = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleBack = React.useCallback(() => {
    void navigate(`${routes.welcome}/restore`);
  }, [navigate]);

  return (
    <HeroPageLayout
      variant="compact"
      align="center"
      aria-label="Restore from backup file"
      context="onboarding"
    >
      <OnboardingHeader
        totalSteps={props.totalSteps}
        activeStep={props.activeStep}
        onBack={handleBack}
        backDisabled={pageState === "loading"}
      />
      <GlassCard className={`UiGlassCardOnboarding ${s.UiRestoreCard}`}>
        <div className="UiSectionTitle">Upload backup file</div>
        <div className="UiSectionSubtitle">
          Choose how you want to set up your OpenClaw. You can change configuration later.
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,.gz,.tgz"
          style={{ display: "none" }}
          onChange={onFileInputChange}
        />

        {/* Drag-and-drop zone */}
        <div
          className={`${s.UiRestoreDropZone}${dragActive ? ` ${s["UiRestoreDropZone--active"]}` : ""}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
        >
          {pageState === "loading" ? (
            <>
              <div className={s.UiRestoreSpinner} aria-label="Restoring backup..." />
              <div className={s.UiRestoreStatusText}>Restoring backup...</div>
            </>
          ) : (
            <>
              <div className={s.UiRestoreDropZoneTitle}>Drag ZIP folder here</div>
              <div className={s.UiRestoreDropZoneSubtext}>
                Or{" "}
                <button
                  type="button"
                  className={s.UiRestoreChooseFileLink}
                  onClick={openFilePicker}
                >
                  choose a file
                </button>{" "}
                from finder
              </div>
            </>
          )}
        </div>

        {/* Error message */}
        {pageState === "error" && error ? <div className={s.UiRestoreError}>{error}</div> : null}
      </GlassCard>
    </HeroPageLayout>
  );
}
