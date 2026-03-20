import * as path from "node:path";

import { getPlatform } from "../platform";

export function resolveRepoRoot(mainDir: string): string {
  // In dev (running from source), the entry file compiles to apps/electron-desktop/dist/main.js.
  // We want the repo root to locate openclaw.mjs and dist/.
  return path.resolve(mainDir, "..", "..", "..");
}

export function resolveBundledOpenClawDir(): string {
  return path.join(process.resourcesPath, "openclaw");
}

export function resolveBundledNodeBin(): string {
  const platform = process.platform;
  const arch = process.arch;
  const base = path.join(process.resourcesPath, "node", `${platform}-${arch}`);
  if (platform === "win32") {
    return path.join(base, "node.exe");
  }
  return path.join(base, "bin", "node");
}

/**
 * Resolve the path to a bundled tool binary shipped inside the Electron
 * resources directory. Layout: `resources/<tool>/<platform>-<arch>/<tool>[.exe]`.
 */
export function bundledBin(tool: string): string {
  const binName = `${tool}${getPlatform().binaryExtension()}`;
  return path.join(process.resourcesPath, tool, `${process.platform}-${process.arch}`, binName);
}

/**
 * Resolve the path to a downloaded tool binary stored next to the Electron
 * app sources (dev mode). Layout: `<appDir>/.<tool>-runtime/<platform>-<arch>/<tool>[.exe]`.
 */
export function downloadedBin(mainDir: string, tool: string): string {
  const appDir = path.resolve(mainDir, "..");
  const binName = `${tool}${getPlatform().binaryExtension()}`;
  return path.join(appDir, `.${tool}-runtime`, `${process.platform}-${process.arch}`, binName);
}

/**
 * Resolve a tool binary path: bundled (packaged) or downloaded (dev).
 * Combines bundledBin / downloadedBin into a single call.
 */
export function resolveBin(tool: string, opts: { isPackaged: boolean; mainDir: string }): string {
  return opts.isPackaged ? bundledBin(tool) : downloadedBin(opts.mainDir, tool);
}

export function resolveBundledGogCredentialsPath(): string {
  return path.join(process.resourcesPath, "gog-credentials", "gog-client-secret.json");
}

export function resolveDownloadedGogCredentialsPath(mainDir: string): string {
  // In dev, the entry file compiles to apps/electron-desktop/dist/main.js.
  const appDir = path.resolve(mainDir, "..");
  return path.join(appDir, ".gog-runtime", "credentials", "gog-client-secret.json");
}

export function resolveGogCredentialsPaths(): string[] {
  return getPlatform()
    .appConfigSearchPaths("gogcli")
    .map((dir) => path.join(dir, "credentials.json"));
}

export function resolveRendererIndex(params: {
  isPackaged: boolean;
  appPath: string;
  mainDir: string;
}): string {
  if (params.isPackaged) {
    return path.join(params.appPath, "renderer", "dist", "index.html");
  }
  // dev: entry file is apps/electron-desktop/dist/main.js
  return path.join(path.resolve(params.mainDir, ".."), "renderer", "dist", "index.html");
}

export function resolvePreloadPath(mainDir: string): string {
  return path.join(mainDir, "preload.js");
}
