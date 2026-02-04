import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const yes = args.has("--yes");

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");

function resolveElectronUserDataDir(appName) {
  const home = os.homedir();
  const platform = process.platform;
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", appName);
  }
  if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, appName);
  }
  // linux and others
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(xdg, appName);
}

function safeRmrf(target) {
  if (!target || typeof target !== "string") {
    throw new Error("invalid target path");
  }
  const normalized = path.resolve(target);
  // Safety guard: only allow deleting paths that clearly belong to this Electron wrapper.
  // Note: the embedded OpenClaw state is stored under Electron's `userData` dir.
  const allowedMarkers = [
    path.sep + "atomicbot-desktop",
    // Back-compat / legacy names.
    path.sep + "openclaw-electron-desktop",
    path.sep + "Atomic Bot",
  ];
  if (!allowedMarkers.some((m) => normalized.includes(m))) {
    throw new Error(`refusing to delete unexpected path: ${normalized}`);
  }
  fs.rmSync(normalized, { recursive: true, force: true });
}

function safeRmrfAppRelative(relPath) {
  const normalized = path.resolve(appRoot, relPath);
  // Safety guard: only allow deleting within this app root.
  if (!normalized.startsWith(appRoot + path.sep)) {
    throw new Error(`refusing to delete path outside app root: ${normalized}`);
  }
  fs.rmSync(normalized, { recursive: true, force: true });
}

function safeRmrfGogcliDir(target) {
  const normalized = path.resolve(target);
  const home = path.resolve(os.homedir());
  const xdg = process.env.XDG_CONFIG_HOME ? path.resolve(process.env.XDG_CONFIG_HOME) : null;
  const allowedRoots = [home, xdg].filter(Boolean);
  const isUnderAllowedRoot = allowedRoots.some((r) => normalized === r || normalized.startsWith(r + path.sep));
  if (!isUnderAllowedRoot) {
    throw new Error(`refusing to delete gogcli path outside home/xdg: ${normalized}`);
  }
  if (!normalized.includes(path.sep + "gogcli")) {
    throw new Error(`refusing to delete non-gogcli path: ${normalized}`);
  }
  fs.rmSync(normalized, { recursive: true, force: true });
}

function resolveGogBin() {
  const platform = process.platform;
  const arch = process.arch;
  const candidates = [
    path.join(appRoot, ".gog-runtime", `${platform}-${arch}`, "gog"),
    path.join(appRoot, "vendor", "gog", `${platform}-${arch}`, "gog"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

function gogcliDirs() {
  const dirs = [];
  const home = os.homedir();
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) {
    dirs.push(path.join(xdg, "gogcli"));
  }
  dirs.push(path.join(home, ".config", "gogcli"));
  if (process.platform === "darwin") {
    dirs.push(path.join(home, "Library", "Application Support", "gogcli"));
  }
  return dirs;
}

function clearGogAuth(gogBin) {
  const list = spawnSync(gogBin, ["auth", "list", "--json", "--no-input"], {
    encoding: "utf-8",
    timeout: 15_000,
  });
  if (list.status !== 0) {
    const msg = String(list.stderr || list.stdout || "").trim();
    console.warn(`[electron-desktop] gog auth list failed: ${msg || "unknown error"}`);
    return;
  }
  let emails = [];
  try {
    const parsed = JSON.parse(String(list.stdout || "")) || {};
    const accounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
    emails = accounts
      .map((a) => (a && typeof a.email === "string" ? a.email.trim() : ""))
      .filter(Boolean);
  } catch (err) {
    console.warn(`[electron-desktop] failed to parse gog auth list JSON: ${String(err)}`);
    return;
  }
  for (const email of emails) {
    const res = spawnSync(gogBin, ["auth", "remove", email, "--force", "--no-input"], {
      encoding: "utf-8",
      timeout: 15_000,
    });
    if (res.status !== 0) {
      const msg = String(res.stderr || res.stdout || "").trim();
      console.warn(`[electron-desktop] gog auth remove failed for ${email}: ${msg || "unknown error"}`);
    } else {
      console.log(`[electron-desktop] gog auth removed: ${email}`);
    }
  }
}

const electronUserDataDir = resolveElectronUserDataDir("atomicbot-desktop");

const targets = [
  { label: "Electron userData", path: electronUserDataDir },
  // Project-local gog artifacts (downloaded runtime + prepared vendor bundle).
  { label: "gog runtime (project)", path: path.join(appRoot, ".gog-runtime"), kind: "project" },
  { label: "gog vendor bundle (project)", path: path.join(appRoot, "vendor", "gog"), kind: "project" },
  // User-level gogcli config + credentials + token metadata. Tokens may also live in keychain.
  ...gogcliDirs().map((p) => ({ label: "gogcli config (user)", path: p, kind: "gogcli" })),
];

console.log("[electron-desktop] Local state reset");
for (const t of targets) {
  const exists = fs.existsSync(t.path);
  console.log(`- ${t.label}: ${t.path}${exists ? "" : " (missing)"}`);
}

if (!yes) {
  console.log("");
  console.log("Dry run only. Re-run with --yes to delete these directories.");
  process.exit(0);
}

// Best-effort: clear stored refresh tokens via gogcli so keychain backends get cleaned too.
const gogBin = resolveGogBin();
if (gogBin) {
  console.log(`[electron-desktop] Clearing gog auth tokens via: ${gogBin}`);
  clearGogAuth(gogBin);
} else {
  console.log("[electron-desktop] gog binary not found; skipping gog auth token cleanup");
}

for (const t of targets) {
  if (!fs.existsSync(t.path)) {
    continue;
  }
  console.log(`Deleting: ${t.path}`);
  if (t.kind === "project") {
    safeRmrfAppRelative(path.relative(appRoot, t.path));
  } else if (t.kind === "gogcli") {
    safeRmrfGogcliDir(t.path);
  } else {
    safeRmrf(t.path);
  }
}

console.log("Done.");

