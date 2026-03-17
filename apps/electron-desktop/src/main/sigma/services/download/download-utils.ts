import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import type { SigmaVersionsConfig } from "../../../../shared/sigma/types";

export async function calculateSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export async function verifySha256(filePath: string, expectedHash: string): Promise<void> {
  if (!expectedHash) {
    console.warn("SHA-256 checksum not configured, skipping verification");
    return;
  }

  const fileSize = fs.statSync(filePath).size;
  console.info(`Verifying SHA-256 for: ${filePath}, size: ${fileSize} bytes`);

  const calculatedHash = await calculateSha256(filePath);

  if (calculatedHash.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error(
      `SHA-256 verification failed!\nFile: ${filePath}\nSize: ${fileSize}\nExpected: ${expectedHash}\nGot: ${calculatedHash}`
    );
  }

  console.info(`SHA-256 verified: ${calculatedHash}`);
}

export function getPlatformId(): string {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "darwin" && arch === "arm64") return "macos-arm64";
  if (platform === "darwin" && arch === "x64") return "macos-x64";
  if (platform === "linux" && arch === "x64") return "linux-x64";
  if (platform === "win32" && arch === "x64") return "windows-x64";
  if (platform === "win32" && arch === "arm64") return "windows-arm64";

  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

export function loadConfig(): SigmaVersionsConfig {
  const possiblePaths = [
    path.join(process.resourcesPath || "", "sigma", "versions.json"),
    path.join(__dirname, "..", "..", "..", "..", "assets", "sigma", "versions.json"),
    path.join(__dirname, "..", "..", "..", "..", "..", "assets", "sigma", "versions.json"),
  ];

  for (const configPath of possiblePaths) {
    try {
      const content = fs.readFileSync(configPath, "utf-8");
      return JSON.parse(content) as SigmaVersionsConfig;
    } catch {
      continue;
    }
  }

  throw new Error("Failed to load sigma/versions.json");
}
