import { app, type BrowserWindow } from "electron";

import { createAppState } from "./main/app-state";
import { bootstrapApp } from "./main/bootstrap/app-bootstrap";
import { registerAppLifecycle, registerProtocolHandler } from "./main/bootstrap/app-lifecycle";
import { handleDeepLink } from "./main/deep-link";
import { broadcastGatewayState, stopGatewayChild } from "./main/gateway/lifecycle";
import { removeGatewayPid } from "./main/gateway/pid-file";
import { initLogger } from "./main/logger";
import { getPlatform } from "./main/platform";
import { createTray } from "./main/tray";
import { disposeAutoUpdater } from "./main/updater";
import { ensureMainWindow, showMainWindow } from "./main/window/window-manager";

// Trigger platform init (e.g. spawn patching on Windows) as early as possible.
const platform = getPlatform();

if (process.env.SIGMAECLIPSE_E2E_USER_DATA) {
  app.setPath("userData", process.env.SIGMAECLIPSE_E2E_USER_DATA);
}

initLogger();

const MAIN_DIR = __dirname;
const DEEP_LINK_PROTOCOL = "sigmaeclipse";

registerProtocolHandler(DEEP_LINK_PROTOCOL);

const st = createAppState();

const replayGatewayState = (win: BrowserWindow) => {
  if (st.gatewayState) {
    broadcastGatewayState(win, st.gatewayState, st);
  }
};

const ensureWin = () => ensureMainWindow(st, MAIN_DIR, replayGatewayState);
const showWin = () => showMainWindow(st, MAIN_DIR, replayGatewayState);

function ensureTray(): void {
  if (st.tray) {
    return;
  }
  st.tray = createTray({
    mainDir: MAIN_DIR,
    trayIconIsTemplate: platform.trayIconIsTemplate,
    onShow: () => void showWin(),
    onQuit: () => app.quit(),
  });
}

const gotTheLock = registerAppLifecycle({
  protocol: DEEP_LINK_PROTOCOL,
  state: st,
  platform,
  showWindow: showWin,
  handleDeepLink: (url, win) => handleDeepLink(url, win, st.gatewayStateDir ?? undefined),
  disposeAutoUpdater,
  stopGatewayChild: () => stopGatewayChild(st, platform),
  removeGatewayPid,
});

void app.whenReady().then(async () => {
  await bootstrapApp({
    gotTheLock,
    state: st,
    mainDir: MAIN_DIR,
    platform,
    ensureWindow: ensureWin,
    ensureTray,
    stopGatewayChild: () => stopGatewayChild(st, platform),
  });
});
