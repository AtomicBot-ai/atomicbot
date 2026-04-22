/**
 * IPC handlers for full config backup (create) and restore.
 *
 * - backup-create: zips the stateDir and lets the user pick a save location.
 * - backup-restore: receives a base64-encoded archive (zip or tar.gz),
 *   validates it, swaps config, and restarts the gateway.
 */
import { app, ipcMain } from "electron";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

import JSZip from "jszip";
import { IPC } from "../../shared/ipc-channels";
import type { BackupHandlerParams } from "./types";
import {
  addDirToZip,
  extractArchiveBuffer,
  readBackupMeta,
  resolveBackupRoot,
} from "./backup/archive-service";
import { showBackupSaveDialog, showOpenclawFolderDialog } from "./backup/dialog-adapter";
import { performRestoreFromSourceDir } from "./backup/restore-service";

export function registerBackupHandlers(params: BackupHandlerParams) {
  const {
    stateDir,
    stopGatewayChild,
    startGateway,
    getMainWindow,
    setGatewayToken,
    acceptConsent,
  } = params;

  // ── Create backup ──────────────────────────────────────────────────────
  ipcMain.handle(IPC.backupCreate, async (_evt, p: { mode?: unknown }) => {
    try {
      const mode = typeof p?.mode === "string" ? p.mode : "self-managed";

      // Build the zip from stateDir
      const zip = new JSZip();
      await addDirToZip(zip, stateDir, stateDir);

      // Embed setup mode so restore can sync renderer state
      zip.file(
        "backup-meta.json",
        JSON.stringify(
          { mode, savedAt: new Date().toISOString(), appVersion: app.getVersion() },
          null,
          2
        )
      );

      const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

      const result = await showBackupSaveDialog(getMainWindow());

      if (result.canceled || !result.filePath) {
        return { ok: false, cancelled: true };
      }

      await fsp.writeFile(result.filePath, zipBuffer);
      return { ok: true };
    } catch (err) {
      console.error("[ipc/backup] backup-create failed:", err);
      return { ok: false, error: `Failed to create backup: ${String(err)}` };
    }
  });

  // ── Restore from backup archive ───────────────────────────────────────
  ipcMain.handle(IPC.backupRestore, async (_evt, p: { data?: unknown; filename?: unknown }) => {
    const b64 = typeof p?.data === "string" ? p.data : "";
    if (!b64) {
      return { ok: false, error: "No data provided" };
    }
    const filenameHint = typeof p?.filename === "string" ? p.filename : undefined;

    const tmpDir = path.join(os.tmpdir(), `openclaw-restore-${randomBytes(8).toString("hex")}`);

    try {
      // Extract archive to temp dir and validate
      const buffer = Buffer.from(b64, "base64");
      await fsp.mkdir(tmpDir, { recursive: true });
      await extractArchiveBuffer(buffer, tmpDir, filenameHint);
      const backupRoot = await resolveBackupRoot(tmpDir);
      const meta = await readBackupMeta(backupRoot);

      await performRestoreFromSourceDir({
        sourceDir: backupRoot,
        stateDir,
        stopGatewayChild,
        startGateway,
        setGatewayToken,
        acceptConsent,
      });
      return { ok: true, meta };
    } catch (err) {
      console.error("[ipc/backup] backup-restore failed:", err);
      return { ok: false, error: `Failed to restore backup: ${String(err)}` };
    } finally {
      try {
        await fsp.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // cleanup best-effort
      }
    }
  });

  // ── Restore from a file path (preferred for large archives) ───────────
  ipcMain.handle(
    IPC.backupRestoreFromFile,
    async (_evt, p: { filePath?: unknown; filename?: unknown }) => {
      const filePath = typeof p?.filePath === "string" ? p.filePath : "";
      if (!filePath) {
        return { ok: false, error: "No file path provided" };
      }
      const filenameHint =
        typeof p?.filename === "string" ? p.filename : path.basename(filePath);

      const tmpDir = path.join(
        os.tmpdir(),
        `openclaw-restore-${randomBytes(8).toString("hex")}`
      );

      try {
        const buffer = await fsp.readFile(filePath);
        await fsp.mkdir(tmpDir, { recursive: true });
        await extractArchiveBuffer(buffer, tmpDir, filenameHint);
        const backupRoot = await resolveBackupRoot(tmpDir);
        const meta = await readBackupMeta(backupRoot);

        await performRestoreFromSourceDir({
          sourceDir: backupRoot,
          stateDir,
          stopGatewayChild,
          startGateway,
          setGatewayToken,
          acceptConsent,
        });
        return { ok: true, meta };
      } catch (err) {
        console.error("[ipc/backup] backup-restore-from-file failed:", err);
        return { ok: false, error: `Failed to restore backup: ${String(err)}` };
      } finally {
        try {
          await fsp.rm(tmpDir, { recursive: true, force: true });
        } catch {
          // cleanup best-effort
        }
      }
    }
  );

  // ── Detect local OpenClaw instance at ~/.openclaw ─────────────────────
  ipcMain.handle(IPC.backupDetectLocal, async () => {
    try {
      const openclawDir = path.join(os.homedir(), ".openclaw");
      const configPath = path.join(openclawDir, "openclaw.json");
      const exists = fs.existsSync(configPath);
      return { found: exists, path: openclawDir };
    } catch (err) {
      console.error("[ipc/backup] backup-detect-local failed:", err);
      return { found: false, path: "" };
    }
  });

  // ── Restore from a directory (local instance or user-picked folder) ───
  ipcMain.handle(IPC.backupRestoreFromDir, async (_evt, p: { dirPath?: unknown }) => {
    const dirPath = typeof p?.dirPath === "string" ? p.dirPath.trim() : "";
    if (!dirPath) {
      return { ok: false, error: "No directory path provided" };
    }

    try {
      // Validate the directory contains openclaw.json
      const configPath = path.join(dirPath, "openclaw.json");
      if (!fs.existsSync(configPath)) {
        return {
          ok: false,
          error: "Invalid OpenClaw directory: openclaw.json not found",
        };
      }

      const meta = await readBackupMeta(dirPath);
      await performRestoreFromSourceDir({
        sourceDir: dirPath,
        stateDir,
        stopGatewayChild,
        startGateway,
        setGatewayToken,
        acceptConsent,
      });
      return { ok: true, meta };
    } catch (err) {
      console.error("[ipc/backup] backup-restore-from-dir failed:", err);
      return { ok: false, error: `Failed to restore: ${String(err)}` };
    }
  });

  // ── Open folder picker and validate it contains openclaw.json ─────────
  ipcMain.handle(IPC.backupSelectFolder, async () => {
    try {
      const result = await showOpenclawFolderDialog(getMainWindow());

      if (result.canceled || !result.filePaths[0]) {
        return { ok: false, cancelled: true };
      }

      const selectedDir = result.filePaths[0];
      const configPath = path.join(selectedDir, "openclaw.json");
      if (!fs.existsSync(configPath)) {
        return {
          ok: false,
          error:
            "Selected folder does not contain openclaw.json. Please select a valid OpenClaw configuration directory.",
        };
      }

      return { ok: true, path: selectedDir };
    } catch (err) {
      console.error("[ipc/backup] backup-select-folder failed:", err);
      return { ok: false, error: `Failed to select folder: ${String(err)}` };
    }
  });
}
