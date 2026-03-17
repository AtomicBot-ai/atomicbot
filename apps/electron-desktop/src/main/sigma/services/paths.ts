import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

function getPlatformDataDir(): string {
  switch (process.platform) {
    case "darwin":
      return path.join(os.homedir(), "Library", "Application Support");
    case "win32":
      return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    default:
      return process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  }
}

export function getAppDataDir(): string {
  const appDir = path.join(getPlatformDataDir(), "com.sigma-eclipse.llm");
  fs.mkdirSync(appDir, { recursive: true });
  return appDir;
}

export function getBinDir(): string {
  const binDir = path.join(getAppDataDir(), "bin");
  fs.mkdirSync(binDir, { recursive: true });
  return binDir;
}

export function getLlamaBinaryPath(): string {
  const binDir = getBinDir();
  const binaryName = process.platform === "win32" ? "llama-server.exe" : "llama-server";
  return path.join(binDir, binaryName);
}

export function getModelsRootDir(): string {
  const modelsDir = path.join(getAppDataDir(), "models");
  fs.mkdirSync(modelsDir, { recursive: true });
  return modelsDir;
}

export function getModelDir(modelName: string): string {
  const modelDir = path.join(getModelsRootDir(), modelName);
  fs.mkdirSync(modelDir, { recursive: true });
  return modelDir;
}

export function getModelFilePath(modelName: string): string {
  const modelDir = getModelDir(modelName);

  try {
    const entries = fs.readdirSync(modelDir);
    for (const entry of entries) {
      if (path.extname(entry) === ".gguf") {
        return path.join(modelDir, entry);
      }
    }
  } catch {
    // directory might not exist yet
  }

  return path.join(modelDir, "model.gguf");
}

export function isModelDownloaded(modelName: string): boolean {
  const modelDir = getModelDir(modelName);

  if (!fs.existsSync(modelDir)) {
    return false;
  }

  try {
    const entries = fs.readdirSync(modelDir);
    return entries.some((entry) => path.extname(entry) === ".gguf");
  } catch {
    return false;
  }
}
