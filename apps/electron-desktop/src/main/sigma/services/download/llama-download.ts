import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { SigmaDownloadProgress } from "../../../../shared/sigma/types";
import { getAppDataDir, getBinDir, getLlamaBinaryPath } from "../paths";
import { updateDownloadStatus } from "../ipc-state";
import { getPlatformId, loadConfig, verifySha256 } from "./download-utils";

const execFileAsync = promisify(execFile);

type ProgressCallback = (progress: SigmaDownloadProgress) => void;

const MAX_CHUNK_RETRIES = 10;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;

function getVersionFilePath(): string {
  return path.join(getBinDir(), "llama-version.txt");
}

function readInstalledVersion(): string | null {
  const versionFile = getVersionFilePath();
  if (!fs.existsSync(versionFile)) return null;
  return fs.readFileSync(versionFile, "utf-8").trim();
}

function writeInstalledVersion(version: string): void {
  fs.writeFileSync(getVersionFilePath(), version);
}

function calculateBackoff(attempt: number): number {
  const delay = BASE_RETRY_DELAY_MS * Math.pow(2, Math.min(attempt, 10));
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

function cleanupOldLlamaFiles(binDir: string): void {
  const names =
    process.platform === "win32" ? ["llama-server.exe", "llama-server"] : ["llama-server"];

  for (const name of names) {
    const p = path.join(binDir, name);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  try {
    for (const entry of fs.readdirSync(binDir)) {
      const ext = path.extname(entry);
      if (ext === ".dylib" || ext === ".metal") {
        fs.unlinkSync(path.join(binDir, entry));
      }
    }
  } catch {
    /* ignore */
  }
}

async function extractLlamaArchive(zipPath: string, binDir: string): Promise<void> {
  const tmpDir = path.join(binDir, "_extract_tmp");
  fs.mkdirSync(tmpDir, { recursive: true });

  if (process.platform === "win32") {
    await execFileAsync("powershell", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${tmpDir}' -Force`,
    ]);
  } else {
    await execFileAsync("unzip", ["-o", zipPath, "-d", tmpDir]);
  }

  let foundServer = false;
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name));
        continue;
      }
      const baseName = entry.name;
      const shouldCopy =
        baseName === "llama-server" ||
        baseName === "llama-server.exe" ||
        baseName.endsWith(".dylib") ||
        baseName.endsWith(".dll") ||
        baseName.endsWith(".metal");

      if (shouldCopy) {
        const src = path.join(dir, baseName);
        const dest = path.join(binDir, baseName);
        console.info(`Extracting: ${src} -> ${dest}`);
        fs.copyFileSync(src, dest);
        if (baseName === "llama-server" || baseName === "llama-server.exe") {
          foundServer = true;
        }
      }
    }
  };

  walk(tmpDir);
  fs.rmSync(tmpDir, { recursive: true, force: true });

  if (!foundServer) {
    throw new Error("llama-server binary not found in archive");
  }
}

export async function checkLlamaVersion(): Promise<boolean> {
  const config = loadConfig();
  const currentVersion = config.llamaCpp.version;
  const installed = readInstalledVersion();
  return installed !== currentVersion;
}

export async function downloadLlamaCpp(onProgress: ProgressCallback): Promise<string> {
  const binDir = getBinDir();
  const appDir = getAppDataDir();
  const config = loadConfig();
  const platformId = getPlatformId();

  const platformConfig = config.llamaCpp.platforms[platformId];
  if (!platformConfig) {
    throw new Error(`Platform '${platformId}' not supported`);
  }

  const version = config.llamaCpp.version;
  const url = platformConfig.url;
  const binaryPath = getLlamaBinaryPath();

  if (fs.existsSync(binaryPath) && readInstalledVersion() === version) {
    return `llama.cpp version ${version} is already installed`;
  }

  if (fs.existsSync(binaryPath)) {
    cleanupOldLlamaFiles(binDir);
  }

  const zipPath = path.join(appDir, "llama-server.zip");
  console.info(`Downloading llama.cpp from: ${url}`);

  updateDownloadStatus(true, 0);
  onProgress({
    downloaded: 0,
    total: null,
    percentage: 0,
    message: "Starting llama.cpp download...",
  });

  let downloaded = 0;
  let consecutiveErrors = 0;

  while (true) {
    const headers: Record<string, string> = { Accept: "*/*", "Accept-Encoding": "identity" };
    if (downloaded > 0) {
      headers["Range"] = `bytes=${downloaded}-`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok && response.status !== 206) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const totalSize =
      downloaded > 0 && response.status === 206
        ? (() => {
            const cr = response.headers.get("content-range");
            const total = cr?.split("/").pop();
            return total ? parseInt(total, 10) : null;
          })()
        : (() => {
            const cl = response.headers.get("content-length");
            return cl ? parseInt(cl, 10) : null;
          })();

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const fileStream = fs.createWriteStream(zipPath, {
      flags: downloaded > 0 ? "a" : "w",
    });

    let lastEmitMb = Math.floor(downloaded / (10 * 1024 * 1024));
    let done = false;

    try {
      while (!done) {
        const result = await reader.read();
        if (result.done) {
          done = true;
          break;
        }

        fileStream.write(Buffer.from(result.value));
        downloaded += result.value.length;
        consecutiveErrors = 0;

        const currentMb = Math.floor(downloaded / (10 * 1024 * 1024));
        const isComplete = totalSize != null && downloaded >= totalSize;
        if (currentMb > lastEmitMb || isComplete) {
          lastEmitMb = currentMb;
          const percentage = totalSize ? (downloaded / totalSize) * 100 : null;

          updateDownloadStatus(true, percentage);
          onProgress({
            downloaded,
            total: totalSize,
            percentage,
            message: totalSize
              ? `Downloading llama.cpp: ${(downloaded / 1_048_576).toFixed(2)} MB / ${(totalSize / 1_048_576).toFixed(2)} MB`
              : `Downloading llama.cpp: ${(downloaded / 1_048_576).toFixed(2)} MB`,
          });
        }
      }
    } catch (e) {
      consecutiveErrors++;
      if (consecutiveErrors >= MAX_CHUNK_RETRIES) {
        fileStream.end();
        throw new Error(`Failed after ${MAX_CHUNK_RETRIES} retries: ${e}`);
      }

      const delay = calculateBackoff(consecutiveErrors - 1);
      console.warn(`Download error, retrying in ${delay}ms...`);
      onProgress({
        downloaded,
        total: totalSize,
        percentage: totalSize ? (downloaded / totalSize) * 100 : null,
        message: `Connection lost, retrying in ${Math.ceil(delay / 1000)} seconds...`,
      });
      fileStream.end();
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    fileStream.end();
    await new Promise<void>((resolve) => fileStream.on("finish", resolve));

    if (done) break;
  }

  console.info(`Download completed: ${(downloaded / 1_048_576).toFixed(2)} MB`);

  if (platformConfig.sha256) {
    try {
      await verifySha256(zipPath, platformConfig.sha256);
    } catch (e) {
      fs.unlinkSync(zipPath);
      updateDownloadStatus(false, null);
      throw e;
    }
  }

  onProgress({
    downloaded,
    total: downloaded,
    percentage: 100,
    message: "Extracting llama.cpp binary...",
  });

  await extractLlamaArchive(zipPath, binDir);

  if (process.platform !== "win32") {
    fs.chmodSync(binaryPath, 0o755);
  }

  fs.unlinkSync(zipPath);
  writeInstalledVersion(version);
  updateDownloadStatus(false, null);

  return `Downloaded llama.cpp version ${version}`;
}
