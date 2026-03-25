import * as path from "node:path";
import * as fs from "node:fs";
import { shell, type BrowserWindow } from "electron";
import { IPC_EVENTS } from "../shared/ipc-channels";

export type DeepLinkData = {
  host: string;
  pathname: string;
  params: Record<string, string>;
};

export function parseDeepLinkUrl(url: string): DeepLinkData | null {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.host,
      pathname: parsed.pathname,
      params: Object.fromEntries(parsed.searchParams.entries()),
    };
  } catch {
    return null;
  }
}

function handleOpenWorkspaceFile(fileName: string, stateDir: string): void {
  const safeName = path.basename(fileName);
  const filePath = path.join(stateDir, "workspace", safeName);
  if (fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
  } else {
    console.warn("[deep-link] Workspace file not found:", filePath);
    shell.openPath(path.join(stateDir, "workspace")).catch(() => {});
  }
}

export function handleDeepLink(url: string, win: BrowserWindow | null, stateDir?: string): void {
  const data = parseDeepLinkUrl(url);
  if (!data) {
    console.warn("[main] Failed to parse deep link URL:", url);
    return;
  }

  if (data.host === "open-workspace-file" && stateDir) {
    const fileName = data.params.name;
    if (fileName) {
      handleOpenWorkspaceFile(fileName, stateDir);
    }
    return;
  }

  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_EVENTS.deepLink, data);
  }
}
