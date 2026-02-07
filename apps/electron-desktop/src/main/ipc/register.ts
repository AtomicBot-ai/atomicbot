import { app, ipcMain, shell, type BrowserWindow } from "electron";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { upsertApiKeyProfile } from "../keys/apiKeys";
import { readAuthProfilesStore, resolveAuthProfilesPath } from "../keys/authProfilesStore";
import { registerGogIpcHandlers } from "../gog/ipc";
import { registerResetAndCloseIpcHandler } from "../reset/ipc";
import { checkForUpdates, downloadUpdate, installUpdate } from "../updater";
import type { GatewayState } from "../types";

type ExecResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  resolvedPath: string | null;
};

type ObsidianVaultEntry = {
  name: string;
  path: string;
  open: boolean;
};

function parseObsidianVaultsFromJson(payload: unknown): ObsidianVaultEntry[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  const root = payload as Record<string, unknown>;
  const vaultsRaw = root.vaults;
  if (!vaultsRaw || typeof vaultsRaw !== "object" || Array.isArray(vaultsRaw)) {
    return [];
  }
  const vaults = vaultsRaw as Record<string, unknown>;
  const openVaultId = typeof root.openVaultId === "string" ? root.openVaultId : null;
  const out: ObsidianVaultEntry[] = [];
  for (const [id, v] of Object.entries(vaults)) {
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      continue;
    }
    const obj = v as Record<string, unknown>;
    const vaultPath = typeof obj.path === "string" ? obj.path.trim() : "";
    if (!vaultPath) {
      continue;
    }
    const isOpen = obj.open === true || (openVaultId ? id === openVaultId : false);
    const name = path.basename(vaultPath);
    out.push({ name, path: vaultPath, open: isOpen });
  }
  out.sort((a, b) => {
    if (a.open !== b.open) {
      return a.open ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  return out;
}

function runCommandWithTimeout(params: {
  bin: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
}): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(params.bin, params.args, {
      cwd: params.cwd,
      env: params.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const onStdout = (chunk: Buffer | string) => {
      stdout += String(chunk);
    };
    const onStderr = (chunk: Buffer | string) => {
      stderr += String(chunk);
    };
    child.stdout?.on("data", onStdout);
    child.stderr?.on("data", onStderr);

    let settled = false;
    const settle = (result: ExecResult) => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        child.stdout?.off("data", onStdout);
        child.stderr?.off("data", onStderr);
      } catch {
        // ignore
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      settle({
        ok: false,
        code: null,
        stdout,
        stderr: `${stderr}${stderr.trim() ? "\n" : ""}timeout after ${params.timeoutMs}ms`,
        resolvedPath: params.bin,
      });
    }, params.timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      settle({
        ok: code === 0,
        code: typeof code === "number" ? code : null,
        stdout,
        stderr,
        resolvedPath: params.bin,
      });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      settle({
        ok: false,
        code: null,
        stdout,
        stderr: `${stderr}${stderr.trim() ? "\n" : ""}${String(err)}`,
        resolvedPath: params.bin,
      });
    });
  });
}

function runCommandWithInputTimeout(params: {
  bin: string;
  args: string[];
  input: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
}): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(params.bin, params.args, {
      cwd: params.cwd,
      env: params.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const onStdout = (chunk: Buffer | string) => {
      stdout += String(chunk);
    };
    const onStderr = (chunk: Buffer | string) => {
      stderr += String(chunk);
    };
    child.stdout?.on("data", onStdout);
    child.stderr?.on("data", onStderr);

    // Feed stdin and close to signal EOF.
    try {
      child.stdin?.write(params.input);
      child.stdin?.end();
    } catch {
      // ignore
    }

    let settled = false;
    const settle = (result: ExecResult) => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        child.stdout?.off("data", onStdout);
        child.stderr?.off("data", onStderr);
      } catch {
        // ignore
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      settle({
        ok: false,
        code: null,
        stdout,
        stderr: `${stderr}${stderr.trim() ? "\n" : ""}timeout after ${params.timeoutMs}ms`,
        resolvedPath: params.bin,
      });
    }, params.timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      settle({
        ok: code === 0,
        code: typeof code === "number" ? code : null,
        stdout,
        stderr,
        resolvedPath: params.bin,
      });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      settle({
        ok: false,
        code: null,
        stdout,
        stderr: `${stderr}${stderr.trim() ? "\n" : ""}${String(err)}`,
        resolvedPath: params.bin,
      });
    });
  });
}

export function registerIpcHandlers(params: {
  getMainWindow: () => BrowserWindow | null;
  getGatewayState: () => GatewayState | null;
  getLogsDir: () => string | null;
  getConsentAccepted: () => boolean;
  acceptConsent: () => Promise<void>;
  startGateway: () => Promise<void>;
  userData: string;
  stateDir: string;
  logsDir: string;
  openclawDir: string;
  gogBin: string;
  memoBin: string;
  remindctlBin: string;
  obsidianCliBin: string;
  ghBin: string;
  stopGatewayChild: () => Promise<void>;
}) {
  ipcMain.handle("open-logs", async () => {
    const logsDir = params.getLogsDir();
    if (!logsDir) {
      return;
    }
    // Open the logs directory in Finder/Explorer.
    await shell.openPath(logsDir);
  });

  ipcMain.handle("devtools-toggle", async () => {
    const win = params.getMainWindow();
    if (!win || win.isDestroyed()) {
      return;
    }
    const wc = win.webContents;
    if (wc.isDevToolsOpened()) {
      wc.closeDevTools();
    } else {
      wc.openDevTools({ mode: "detach" });
    }
  });

  ipcMain.handle("open-external", async (_evt, p: { url?: unknown }) => {
    const url = typeof p?.url === "string" ? p.url : "";
    if (!url) {
      return;
    }
    await shell.openExternal(url);
  });

  ipcMain.handle("gateway-get-info", async () => ({ state: params.getGatewayState() }));

  ipcMain.handle("consent-get", async () => ({ accepted: params.getConsentAccepted() }));

  ipcMain.handle("consent-accept", async () => {
    await params.acceptConsent();
    await params.startGateway();
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

  ipcMain.handle("auth-set-api-key", async (_evt, p: { provider?: unknown; apiKey?: unknown }) => {
    const provider = typeof p?.provider === "string" ? p.provider.trim() : "";
    const apiKey = typeof p?.apiKey === "string" ? p.apiKey : "";
    if (!provider) {
      throw new Error("provider is required");
    }
    upsertApiKeyProfile({
      stateDir: params.stateDir,
      provider,
      key: apiKey,
      profileName: "default",
    });
    return { ok: true } as const;
  });

  ipcMain.handle("auth-has-api-key", async (_evt, p: { provider?: unknown }) => {
    const provider = typeof p?.provider === "string" ? p.provider.trim().toLowerCase() : "";
    if (!provider) {
      throw new Error("provider is required");
    }
    const authProfilesPath = resolveAuthProfilesPath({ stateDir: params.stateDir });
    const store = readAuthProfilesStore({ authProfilesPath });
    const configured = Object.values(store.profiles).some(
      (profile) =>
        profile.type === "api_key" && profile.provider === provider && profile.key.trim().length > 0
    );
    return { configured } as const;
  });

  ipcMain.handle("memo-check", async () => {
    const memoBin = params.memoBin;
    if (!fs.existsSync(memoBin)) {
      return {
        ok: false,
        code: null,
        stdout: "",
        stderr: `memo binary not found at: ${memoBin}\nRun: cd apps/electron-desktop && npm run prepare:memo:all`,
        resolvedPath: null,
      } as const;
    }
    const res = spawnSync(memoBin, ["--help"], {
      encoding: "utf-8",
      cwd: params.openclawDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = String(res.stdout || "");
    const stderr = String(res.stderr || "");
    const ok = res.status === 0;
    return {
      ok,
      code: typeof res.status === "number" ? res.status : null,
      stdout,
      stderr,
      resolvedPath: memoBin,
    } as const;
  });

  ipcMain.handle("remindctl-authorize", async () => {
    const remindctlBin = params.remindctlBin;
    if (!fs.existsSync(remindctlBin)) {
      return {
        ok: false,
        code: null,
        stdout: "",
        stderr:
          `remindctl binary not found at: ${remindctlBin}\n` +
          "Run: cd apps/electron-desktop && npm run prepare:remindctl:all",
        resolvedPath: null,
      } satisfies ExecResult;
    }
    // `authorize` triggers the macOS permission prompt. Give it a generous timeout.
    return await runCommandWithTimeout({
      bin: remindctlBin,
      args: ["authorize"],
      cwd: params.openclawDir,
      timeoutMs: 120_000,
    });
  });

  ipcMain.handle("remindctl-today-json", async () => {
    const remindctlBin = params.remindctlBin;
    if (!fs.existsSync(remindctlBin)) {
      return {
        ok: false,
        code: null,
        stdout: "",
        stderr:
          `remindctl binary not found at: ${remindctlBin}\n` +
          "Run: cd apps/electron-desktop && npm run prepare:remindctl:all",
        resolvedPath: null,
      } satisfies ExecResult;
    }
    // End-to-end check: should return JSON if permission is granted.
    return await runCommandWithTimeout({
      bin: remindctlBin,
      args: ["today", "--json"],
      cwd: params.openclawDir,
      timeoutMs: 20_000,
    });
  });

  ipcMain.handle("obsidian-cli-check", async () => {
    const obsidianCliBin = params.obsidianCliBin;
    if (!fs.existsSync(obsidianCliBin)) {
      return {
        ok: false,
        code: null,
        stdout: "",
        stderr:
          `obsidian-cli binary not found at: ${obsidianCliBin}\n` +
          "Run: cd apps/electron-desktop && npm run prepare:obsidian-cli:all",
        resolvedPath: null,
      } satisfies ExecResult;
    }
    const res = spawnSync(obsidianCliBin, ["--help"], {
      encoding: "utf-8",
      cwd: params.openclawDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = String(res.stdout || "");
    const stderr = String(res.stderr || "");
    const ok = res.status === 0;
    return {
      ok,
      code: typeof res.status === "number" ? res.status : null,
      stdout,
      stderr,
      resolvedPath: obsidianCliBin,
    } satisfies ExecResult;
  });

  ipcMain.handle("obsidian-cli-print-default-path", async () => {
    const obsidianCliBin = params.obsidianCliBin;
    if (!fs.existsSync(obsidianCliBin)) {
      return {
        ok: false,
        code: null,
        stdout: "",
        stderr:
          `obsidian-cli binary not found at: ${obsidianCliBin}\n` +
          "Run: cd apps/electron-desktop && npm run prepare:obsidian-cli:all",
        resolvedPath: null,
      } satisfies ExecResult;
    }

    const res = await runCommandWithTimeout({
      bin: obsidianCliBin,
      args: ["print-default", "--path-only"],
      cwd: params.openclawDir,
      timeoutMs: 10_000,
    });

    const defaultPath = res.stdout.trim();
    if (!res.ok) {
      return res;
    }
    if (!defaultPath) {
      return {
        ok: false,
        code: res.code,
        stdout: res.stdout,
        stderr:
          res.stderr ||
          'default vault not set. Run: obsidian-cli set-default "<vault-folder-name>"',
        resolvedPath: res.resolvedPath,
      } satisfies ExecResult;
    }

    try {
      const st = fs.statSync(defaultPath);
      if (!st.isDirectory()) {
        return {
          ok: false,
          code: res.code,
          stdout: res.stdout,
          stderr: `default vault path is not a directory: ${defaultPath}`,
          resolvedPath: res.resolvedPath,
        } satisfies ExecResult;
      }
    } catch {
      return {
        ok: false,
        code: res.code,
        stdout: res.stdout,
        stderr: `default vault path does not exist: ${defaultPath}`,
        resolvedPath: res.resolvedPath,
      } satisfies ExecResult;
    }

    return {
      ...res,
      stdout: `${defaultPath}\n`,
    } satisfies ExecResult;
  });

  ipcMain.handle("obsidian-vaults-list", async () => {
    // Obsidian stores vaults config here on macOS.
    const cfgPath = path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "obsidian",
      "obsidian.json"
    );
    try {
      if (!fs.existsSync(cfgPath)) {
        return {
          ok: true,
          code: 0,
          stdout: "[]\n",
          stderr: `Obsidian config not found at: ${cfgPath}`,
          resolvedPath: cfgPath,
        } satisfies ExecResult;
      }
      const raw = fs.readFileSync(cfgPath, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      const vaults = parseObsidianVaultsFromJson(parsed);
      return {
        ok: true,
        code: 0,
        stdout: `${JSON.stringify(vaults, null, 2)}\n`,
        stderr: "",
        resolvedPath: cfgPath,
      } satisfies ExecResult;
    } catch (err) {
      return {
        ok: false,
        code: null,
        stdout: "",
        stderr: `failed to read Obsidian vaults: ${String(err)}`,
        resolvedPath: cfgPath,
      } satisfies ExecResult;
    }
  });

  ipcMain.handle("obsidian-cli-set-default", async (_evt, p: { vaultName?: unknown }) => {
    const obsidianCliBin = params.obsidianCliBin;
    const vaultName = typeof p?.vaultName === "string" ? p.vaultName.trim() : "";
    if (!vaultName) {
      return {
        ok: false,
        code: null,
        stdout: "",
        stderr: "vaultName is required",
        resolvedPath: obsidianCliBin,
      } satisfies ExecResult;
    }
    if (!fs.existsSync(obsidianCliBin)) {
      return {
        ok: false,
        code: null,
        stdout: "",
        stderr:
          `obsidian-cli binary not found at: ${obsidianCliBin}\n` +
          "Run: cd apps/electron-desktop && npm run prepare:obsidian-cli:all",
        resolvedPath: null,
      } satisfies ExecResult;
    }

    // `set-default` writes the selection for future commands.
    return await runCommandWithTimeout({
      bin: obsidianCliBin,
      args: ["set-default", vaultName],
      cwd: params.openclawDir,
      timeoutMs: 10_000,
    });
  });

  ipcMain.handle("gh-check", async () => {
    const ghBin = params.ghBin;
    if (!fs.existsSync(ghBin)) {
      return {
        ok: false,
        code: null,
        stdout: "",
        stderr: `gh binary not found at: ${ghBin}\nRun: cd apps/electron-desktop && npm run prepare:gh:all`,
        resolvedPath: null,
      } satisfies ExecResult;
    }
    const res = spawnSync(ghBin, ["--version"], {
      encoding: "utf-8",
      cwd: params.openclawDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GH_CONFIG_DIR: path.join(params.stateDir, "gh") },
    });
    const stdout = String(res.stdout || "");
    const stderr = String(res.stderr || "");
    const ok = res.status === 0;
    return {
      ok,
      code: typeof res.status === "number" ? res.status : null,
      stdout,
      stderr,
      resolvedPath: ghBin,
    } satisfies ExecResult;
  });

  ipcMain.handle("gh-auth-login-pat", async (_evt, p: { pat?: unknown }) => {
    const ghBin = params.ghBin;
    const pat = typeof p?.pat === "string" ? p.pat : "";
    if (!pat) {
      return {
        ok: false,
        code: null,
        stdout: "",
        stderr: "PAT is required",
        resolvedPath: ghBin,
      } satisfies ExecResult;
    }
    if (!fs.existsSync(ghBin)) {
      return {
        ok: false,
        code: null,
        stdout: "",
        stderr: `gh binary not found at: ${ghBin}\nRun: cd apps/electron-desktop && npm run prepare:gh:all`,
        resolvedPath: null,
      } satisfies ExecResult;
    }
    const ghConfigDir = path.join(params.stateDir, "gh");
    try {
      fs.mkdirSync(ghConfigDir, { recursive: true });
    } catch {
      // ignore
    }
    // Feed PAT via stdin. Ensure trailing newline so gh reads the token.
    return await runCommandWithInputTimeout({
      bin: ghBin,
      args: ["auth", "login", "--hostname", "github.com", "--with-token"],
      input: pat.endsWith("\n") ? pat : `${pat}\n`,
      cwd: params.openclawDir,
      env: { ...process.env, GH_CONFIG_DIR: ghConfigDir },
      timeoutMs: 30_000,
    });
  });

  ipcMain.handle("gh-auth-status", async () => {
    const ghBin = params.ghBin;
    if (!fs.existsSync(ghBin)) {
      return {
        ok: false,
        code: null,
        stdout: "",
        stderr: `gh binary not found at: ${ghBin}\nRun: cd apps/electron-desktop && npm run prepare:gh:all`,
        resolvedPath: null,
      } satisfies ExecResult;
    }
    const ghConfigDir = path.join(params.stateDir, "gh");
    try {
      fs.mkdirSync(ghConfigDir, { recursive: true });
    } catch {
      // ignore
    }
    return await runCommandWithTimeout({
      bin: ghBin,
      args: ["auth", "status", "--hostname", "github.com"],
      cwd: params.openclawDir,
      env: { ...process.env, GH_CONFIG_DIR: ghConfigDir },
      timeoutMs: 15_000,
    });
  });

  ipcMain.handle("gh-api-user", async () => {
    const ghBin = params.ghBin;
    if (!fs.existsSync(ghBin)) {
      return {
        ok: false,
        code: null,
        stdout: "",
        stderr: `gh binary not found at: ${ghBin}\nRun: cd apps/electron-desktop && npm run prepare:gh:all`,
        resolvedPath: null,
      } satisfies ExecResult;
    }
    const ghConfigDir = path.join(params.stateDir, "gh");
    try {
      fs.mkdirSync(ghConfigDir, { recursive: true });
    } catch {
      // ignore
    }
    return await runCommandWithTimeout({
      bin: ghBin,
      args: ["api", "user"],
      cwd: params.openclawDir,
      env: { ...process.env, GH_CONFIG_DIR: ghConfigDir },
      timeoutMs: 15_000,
    });
  });

  // Auto-updater IPC handlers.
  ipcMain.handle("updater-check", async () => {
    await checkForUpdates();
    return { ok: true } as const;
  });

  ipcMain.handle("updater-download", async () => {
    await downloadUpdate();
    return { ok: true } as const;
  });

  ipcMain.handle("updater-install", async () => {
    installUpdate();
    return { ok: true } as const;
  });

  registerGogIpcHandlers({
    gogBin: params.gogBin,
    openclawDir: params.openclawDir,
    userData: params.userData,
    // Let the gog IPC layer auto-discover the correct staged credentials file. Passing an empty
    // string also keeps this call compatible with older TS inference in some tooling.
    gogCredentialsPath: "",
  });
  registerResetAndCloseIpcHandler({
    userData: params.userData,
    stateDir: params.stateDir,
    logsDir: params.logsDir,
    gogBin: params.gogBin,
    openclawDir: params.openclawDir,
    stopGatewayChild: params.stopGatewayChild,
  });
}
