import { app, BrowserWindow } from "electron";

export async function createMainWindow(params: {
  preloadPath: string;
  rendererIndex: string;
  iconPath?: string;
}): Promise<BrowserWindow> {
  const windowTitle = `Atomic Bot v${app.getVersion()}`;

  const win = new BrowserWindow({
    width: 950,
    height: 650,
    minWidth: 950,
    minHeight: 650,
    title: windowTitle,
    ...(params.iconPath ? { icon: params.iconPath } : {}),

    backgroundColor: "#0b0f14",
    webPreferences: {
      preload: params.preloadPath,
      sandbox: true,
      contextIsolation: true,
    },
  });

  // Prevent the <title> tag in index.html from overriding our versioned title.
  win.on("page-title-updated", (event) => {
    event.preventDefault();
  });

  await win.loadFile(params.rendererIndex);

  return win;
}
