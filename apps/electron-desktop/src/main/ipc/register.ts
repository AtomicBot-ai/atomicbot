import { app, dialog, ipcMain, shell, type BrowserWindow } from "electron";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

import JSZip from "jszip";
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

// ── Custom skill types and helpers ────────────────────────────────────────────

type CustomSkillMeta = {
  name: string;
  description: string;
  emoji: string;
  dirName: string;
};

/**
 * Parse SKILL.md frontmatter to extract name, description, and emoji.
 * Frontmatter is the YAML block between two `---` markers at the top of the file.
 */
function parseSkillFrontmatter(content: string): Omit<CustomSkillMeta, "dirName"> {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    return { name: "", description: "", emoji: "🧩" };
  }
  const block = fmMatch[1] ?? "";

  // Extract name: first YAML line starting with "name:"
  const nameMatch = block.match(/^name:\s*(.+)$/m);
  const name = nameMatch?.[1]?.trim() ?? "";

  // Extract description: first YAML line starting with "description:"
  const descMatch = block.match(/^description:\s*(.+)$/m);
  const description = descMatch?.[1]?.trim() ?? "";

  // Extract emoji from metadata JSON block: "emoji": "value"
  let emoji = "🦞";
  const emojiMatch = block.match(/"emoji"\s*:\s*"([^"]+)"/);
  if (emojiMatch?.[1]) {
    emoji = emojiMatch[1];
  }

  return { name, description, emoji };
}

/**
 * Extract a zip buffer into destDir using JSZip.
 * Validates that no entry escapes the destination directory.
 */
async function extractZipBuffer(buffer: Buffer, destDir: string): Promise<void> {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);

  for (const entry of entries) {
    const entryPath = entry.name.replaceAll("\\", "/");
    if (!entryPath || entryPath.endsWith("/")) {
      const dirPath = path.resolve(destDir, entryPath);
      if (!dirPath.startsWith(destDir)) {
        throw new Error(`zip entry escapes destination: ${entry.name}`);
      }
      await fsp.mkdir(dirPath, { recursive: true });
      continue;
    }

    const outPath = path.resolve(destDir, entryPath);
    if (!outPath.startsWith(destDir)) {
      throw new Error(`zip entry escapes destination: ${entry.name}`);
    }
    await fsp.mkdir(path.dirname(outPath), { recursive: true });
    const data = await entry.async("nodebuffer");
    await fsp.writeFile(outPath, data);
  }
}

/**
 * After extraction, determine the skill root directory.
 * If the zip contained a single top-level directory, that's the root.
 * Otherwise the extraction directory itself is the root.
 */
async function resolveSkillRoot(extractDir: string): Promise<string> {
  const entries = await fsp.readdir(extractDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());

  // Single top-level directory: check if SKILL.md is inside it
  if (dirs.length === 1 && dirs[0]) {
    const candidate = path.join(extractDir, dirs[0].name);
    try {
      await fsp.stat(path.join(candidate, "SKILL.md"));
      return candidate;
    } catch {
      // SKILL.md not in subdirectory, fall through
    }
  }

  // Check if SKILL.md is directly in extractDir
  try {
    await fsp.stat(path.join(extractDir, "SKILL.md"));
    return extractDir;
  } catch {
    // Not found at root either
  }

  // Last resort: if single dir, return it even without SKILL.md
  if (dirs.length === 1 && dirs[0]) {
    return path.join(extractDir, dirs[0].name);
  }
  return extractDir;
}

/**
 * Scan the workspace skills directory and return metadata for each custom skill.
 */
async function listCustomSkillsFromDir(skillsDir: string): Promise<CustomSkillMeta[]> {
  try {
    await fsp.stat(skillsDir);
  } catch {
    return [];
  }
  const entries = await fsp.readdir(skillsDir, { withFileTypes: true });
  const skills: CustomSkillMeta[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {continue;}
    const skillMdPath = path.join(skillsDir, entry.name, "SKILL.md");
    try {
      const content = await fsp.readFile(skillMdPath, "utf-8");
      const meta = parseSkillFrontmatter(content);
      skills.push({
        name: meta.name || entry.name,
        description: meta.description,
        emoji: meta.emoji,
        dirName: entry.name,
      });
    } catch {
      // No SKILL.md or unreadable — skip
    }
  }
  return skills;
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
  stateDirOverridePath: string;
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

  // Open the agent workspace folder in Finder/Explorer.
  ipcMain.handle("open-workspace-folder", async () => {
    const workspaceDir = path.join(params.stateDir, "workspace");
    try {
      fs.mkdirSync(workspaceDir, { recursive: true });
    } catch {
      // ignore
    }
    await shell.openPath(workspaceDir);
  });

  // Open the Openclaw state folder in Finder/Explorer.
  ipcMain.handle("open-openclaw-folder", async () => {
    try {
      fs.mkdirSync(params.stateDir, { recursive: true });
    } catch {
      // ignore
    }
    await shell.openPath(params.stateDir);
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

  ipcMain.handle(
    "auth-validate-api-key",
    async (_evt, p: { provider?: unknown; apiKey?: unknown }) => {
      const provider = typeof p?.provider === "string" ? p.provider.trim() : "";
      const apiKey = typeof p?.apiKey === "string" ? p.apiKey : "";
      if (!provider) {
        return { valid: false, error: "provider is required" };
      }
      if (!apiKey) {
        return { valid: false, error: "API key is required" };
      }
      const { validateProviderApiKey } = await import("../keys/validateApiKey");
      return validateProviderApiKey(provider, apiKey);
    }
  );

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
      // Validate JSON before writing to prevent corruption.
      JSON.parse(content);
    } catch {
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

  // ── State directory IPC handlers ────────────────────────────────────────────

  ipcMain.handle("get-state-dir", () => {
    return { stateDir: params.stateDir };
  });

  ipcMain.handle("set-state-dir-override", async (_evt, p: { stateDir?: unknown }) => {
    const dir = typeof p?.stateDir === "string" ? p.stateDir.trim() : "";
    try {
      if (dir) {
        fs.writeFileSync(
          params.stateDirOverridePath,
          `${JSON.stringify({ stateDir: dir }, null, 2)}\n`,
          "utf-8"
        );
      } else {
        // Clear the override by removing the file.
        if (fs.existsSync(params.stateDirOverridePath)) {
          fs.unlinkSync(params.stateDirOverridePath);
        }
      }
      return { ok: true, needsRestart: true } as const;
    } catch (err) {
      return { ok: false, error: String(err) } as const;
    }
  });

  ipcMain.handle("pick-state-dir-folder", async () => {
    const win = params.getMainWindow();
    if (!win) {
      return { ok: false, path: "" };
    }
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory", "createDirectory"],
      title: "Select State Directory",
    });
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, path: "" };
    }
    return { ok: true, path: result.filePaths[0] };
  });

  // App version (used by WhatsNew modal to detect updates).
  ipcMain.handle("get-app-version", () => {
    return { version: app.getVersion() };
  });

  // Fetch release notes from GitHub (runs in main process to avoid CSP restrictions).
  ipcMain.handle(
    "fetch-release-notes",
    async (_evt, p: { version?: string; owner?: string; repo?: string }) => {
      const version = typeof p?.version === "string" ? p.version : "";
      const owner = typeof p?.owner === "string" ? p.owner : "";
      const repo = typeof p?.repo === "string" ? p.repo : "";
      if (!version || !owner || !repo) {return { ok: false, body: "", htmlUrl: "" };}
      const tag = version.startsWith("v") ? version : `v${version}`;
      const url = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`;
      try {
        const res = await fetch(url, {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!res.ok) {return { ok: false, body: "", htmlUrl: "" };}
        const data = (await res.json()) as { body?: string; html_url?: string };
        return { ok: true, body: data.body ?? "", htmlUrl: data.html_url ?? "" };
      } catch {
        return { ok: false, body: "", htmlUrl: "" };
      }
    },
  );

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

  // ── Custom skill installation ──────────────────────────────────────────────

  const workspaceSkillsDir = path.join(params.stateDir, "workspace", "skills");

  ipcMain.handle("install-custom-skill", async (_evt, p: { data?: unknown }) => {
    const b64 = typeof p?.data === "string" ? p.data : "";
    if (!b64) {
      return { ok: false, error: "No data provided" };
    }

    const tmpDir = path.join(os.tmpdir(), `openclaw-skill-${randomBytes(8).toString("hex")}`);
    try {
      const buffer = Buffer.from(b64, "base64");
      await fsp.mkdir(tmpDir, { recursive: true });
      await extractZipBuffer(buffer, tmpDir);

      const skillRoot = await resolveSkillRoot(tmpDir);

      // Validate that SKILL.md exists
      const skillMdPath = path.join(skillRoot, "SKILL.md");
      try {
        await fsp.stat(skillMdPath);
      } catch {
        return { ok: false, error: "SKILL.md not found in the archive" };
      }

      const content = await fsp.readFile(skillMdPath, "utf-8");
      const meta = parseSkillFrontmatter(content);

      // Determine the target directory name from frontmatter name or the source dir name
      const dirName = (meta.name || path.basename(skillRoot)).replace(/[^a-zA-Z0-9._-]/g, "-");
      if (!dirName) {
        return { ok: false, error: "Could not determine skill name" };
      }

      const destDir = path.join(workspaceSkillsDir, dirName);
      await fsp.mkdir(workspaceSkillsDir, { recursive: true });

      // If skill already exists, remove it first (overwrite)
      try {
        await fsp.rm(destDir, { recursive: true, force: true });
      } catch {
        // ignore
      }

      // Copy skill files to workspace
      await fsp.cp(skillRoot, destDir, { recursive: true });

      return {
        ok: true,
        skill: {
          name: meta.name || dirName,
          description: meta.description,
          emoji: meta.emoji,
          dirName,
        } satisfies CustomSkillMeta,
      };
    } catch (err) {
      return { ok: false, error: `Failed to install skill: ${String(err)}` };
    } finally {
      // Clean up temp directory
      try {
        await fsp.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  ipcMain.handle("list-custom-skills", async () => {
    try {
      const skills = await listCustomSkillsFromDir(workspaceSkillsDir);
      return { ok: true, skills };
    } catch (err) {
      return { ok: true, skills: [] as CustomSkillMeta[] };
    }
  });

  ipcMain.handle("remove-custom-skill", async (_evt, p: { dirName?: unknown }) => {
    const dirName = typeof p?.dirName === "string" ? p.dirName.trim() : "";
    if (!dirName) {
      return { ok: false, error: "Skill directory name is required" };
    }
    // Prevent path traversal
    if (dirName.includes("/") || dirName.includes("\\") || dirName === ".." || dirName === ".") {
      return { ok: false, error: "Invalid skill name" };
    }
    const targetDir = path.join(workspaceSkillsDir, dirName);
    if (!targetDir.startsWith(workspaceSkillsDir)) {
      return { ok: false, error: "Invalid skill path" };
    }
    try {
      await fsp.rm(targetDir, { recursive: true, force: true });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: `Failed to remove skill: ${String(err)}` };
    }
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
