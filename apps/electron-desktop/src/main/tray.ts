import { app, Menu, nativeImage, Tray } from "electron";
import * as path from "node:path";

export function getTrayIconPath(mainDir: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "assets", "trayTemplate.png");
  }
  return path.join(mainDir, "..", "assets", "trayTemplate.png");
}

export function getWindowIconPath(mainDir: string): string | undefined {
  if (process.platform !== "win32") {
    return undefined;
  }
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "assets", "icon.ico");
  }
  return path.join(mainDir, "..", "assets", "icon.ico");
}

export function createTray(opts: {
  mainDir: string;
  trayIconIsTemplate: boolean;
  onShow: () => void;
  onQuit: () => void;
}): Tray {
  const trayImage = nativeImage.createFromPath(getTrayIconPath(opts.mainDir));
  if (opts.trayIconIsTemplate) {
    trayImage.setTemplateImage(true);
  }

  const tray = new Tray(trayImage);
  tray.setToolTip("Sigma Eclipse");

  const menu = Menu.buildFromTemplate([
    {
      label: "Show Sigma Eclipse",
      click: () => {
        opts.onShow();
      },
    },
    { type: "separator" as const },
    {
      label: "Quit",
      click: () => {
        opts.onQuit();
      },
    },
  ]);

  tray.on("click", () => {
    tray.popUpContextMenu(menu);
  });
  tray.on("right-click", () => {
    tray.popUpContextMenu(menu);
  });

  tray.setContextMenu(menu);
  return tray;
}
