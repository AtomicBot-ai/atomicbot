import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { SigmaDownloadProgress, SigmaModelInfo } from "../../../../shared/sigma/types";
import { getModelDir, isModelDownloaded } from "../paths";
import { updateDownloadStatus } from "../ipc-state";
import { loadConfig, verifySha256 } from "./download-utils";

const execFileAsync = promisify(execFile);

type ProgressCallback = (progress: SigmaDownloadProgress) => void;

const MAX_CHUNK_RETRIES = 10;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;

function calculateBackoff(attempt: number): number {
  const delay = BASE_RETRY_DELAY_MS * Math.pow(2, Math.min(attempt, 10));
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

async function downloadWithProgress(
  url: string,
  zipPath: string,
  modelName: string,
  onProgress: ProgressCallback
): Promise<number> {
  console.info(`Downloading model '${modelName}' from: ${url}`);

  let downloaded = 0;
  let consecutiveErrors = 0;

  updateDownloadStatus(true, 0);
  onProgress({
    downloaded: 0,
    total: null,
    percentage: 0,
    message: `Starting model '${modelName}' download...`,
  });

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
              ? `Downloading model '${modelName}': ${(downloaded / 1_048_576).toFixed(2)} MB / ${(totalSize / 1_048_576).toFixed(2)} MB`
              : `Downloading model '${modelName}': ${(downloaded / 1_048_576).toFixed(2)} MB`,
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
  return downloaded;
}

async function extractModelArchive(zipPath: string, modelDir: string): Promise<void> {
  fs.mkdirSync(modelDir, { recursive: true });

  if (process.platform === "win32") {
    await execFileAsync("powershell", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${modelDir}' -Force`,
    ]);
  } else {
    await execFileAsync("unzip", ["-o", zipPath, "-d", modelDir]);
  }

  console.info("Extraction completed");
}

export async function downloadModelByName(
  modelName: string,
  onProgress: ProgressCallback
): Promise<string> {
  const config = loadConfig();
  const modelConfig = config.models[modelName];
  if (!modelConfig) {
    throw new Error(`Model '${modelName}' not found in configuration`);
  }

  const modelDir = getModelDir(modelName);
  const zipPath = path.join(modelDir, "model.zip");

  const downloaded = await downloadWithProgress(modelConfig.url, zipPath, modelName, onProgress);

  if (modelConfig.sha256) {
    try {
      await verifySha256(zipPath, modelConfig.sha256);
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
    message: `Extracting model '${modelName}'...`,
  });

  await extractModelArchive(zipPath, modelDir);
  fs.unlinkSync(zipPath);
  updateDownloadStatus(false, null);

  return `Model '${modelName}' downloaded and extracted`;
}

export function listAvailableModels(): SigmaModelInfo[] {
  const config = loadConfig();
  const models: SigmaModelInfo[] = [];

  for (const [name, modelConfig] of Object.entries(config.models)) {
    const downloaded = isModelDownloaded(name);
    models.push({
      name,
      version: modelConfig.version,
      is_downloaded: downloaded,
      path: downloaded ? getModelDir(name) : null,
    });
  }

  models.sort((a, b) => a.name.localeCompare(b.name));
  return models;
}

export function checkModelDownloaded(modelName: string): boolean {
  return isModelDownloaded(modelName);
}

export function deleteModel(modelName: string): void {
  const modelDir = getModelDir(modelName);
  if (!fs.existsSync(modelDir)) {
    throw new Error(`Model '${modelName}' is not downloaded`);
  }
  fs.rmSync(modelDir, { recursive: true, force: true });
}
