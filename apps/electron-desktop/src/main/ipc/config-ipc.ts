/**
 * IPC handlers for app config, consent, gateway info, and launch-at-login.
 */
import { app, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";

import type { ConfigHandlerParams } from "./types";

export function registerConfigHandlers(params: ConfigHandlerParams) {
  ipcMain.handle("gateway-get-info", async () => ({ state: params.getGatewayState() }));

  ipcMain.handle("consent-get", async () => ({ accepted: params.getConsentAccepted() }));

  ipcMain.handle("consent-accept", async () => {
    await params.acceptConsent();
    await params.startGateway();
    return { ok: true } as const;
  });

  ipcMain.handle("onboarded-get", () => ({ onboarded: params.getOnboarded() }));

  ipcMain.handle("onboarded-set", (_evt, p: { onboarded?: unknown }) => {
    const value = typeof p?.onboarded === "boolean" ? p.onboarded : false;
    params.setOnboarded(value);
    return { ok: true } as const;
  });

  ipcMain.handle("gateway-start", async () => {
    await params.startGateway();
    return { ok: true } as const;
  });

  ipcMain.handle("gateway-retry", async () => {
    app.relaunch();
    app.exit(0);
  });

  // OpenClaw config (openclaw.json) read/write.
  const configJsonPath = path.join(params.stateDir, "openclaw.json");

  ipcMain.handle("config-read", async () => {
    try {
      if (!fs.existsSync(configJsonPath)) {
        return { ok: true, content: "" };
      }
      const content = fs.readFileSync(configJsonPath, "utf-8");
      return { ok: true, content };
    } catch (err) {
      return { ok: false, content: "", error: String(err) };
    }
  });

  ipcMain.handle("config-write", async (_evt, p: { content?: unknown }) => {
    const content = typeof p?.content === "string" ? p.content : "";
    try {
      JSON.parse(content);
    } catch (err) {
      console.warn("[ipc/config] config-write JSON parse failed:", err);
      return { ok: false, error: "Invalid JSON" };
    }
    try {
      fs.mkdirSync(path.dirname(configJsonPath), { recursive: true });
      fs.writeFileSync(configJsonPath, content, "utf-8");
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // Launch at login (auto-start) IPC handlers.
  ipcMain.handle("launch-at-login-get", () => {
    const settings = app.getLoginItemSettings();
    return { enabled: settings.openAtLogin };
  });

  ipcMain.handle("launch-at-login-set", (_evt, p: { enabled?: unknown }) => {
    const enabled = typeof p?.enabled === "boolean" ? p.enabled : false;
    app.setLoginItemSettings({ openAtLogin: enabled });
    return { ok: true } as const;
  });

  // App version
  ipcMain.handle("get-app-version", () => {
    return { version: app.getVersion() };
  });
}
