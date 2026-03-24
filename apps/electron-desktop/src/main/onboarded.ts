/**
 * Persists onboarding completion state to the shared data directory
 * so the native messaging host can gate gateway readiness on it.
 *
 * File location: <shared-data-dir>/onboarded.json  (same dir as gateway-info.json)
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const ONBOARDED_FILENAME = "onboarded.json";

function getSharedDataDir(): string {
  switch (process.platform) {
    case "darwin":
      return path.join(os.homedir(), "Library", "Application Support", "com.sigma-eclipse.llm");
    case "win32": {
      const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
      return path.join(appData, "com.sigma-eclipse.llm");
    }
    default:
      return path.join(
        process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"),
        "com.sigma-eclipse.llm"
      );
  }
}

function getOnboardedPath(): string {
  return path.join(getSharedDataDir(), ONBOARDED_FILENAME);
}

export function readOnboardedFromDisk(): boolean {
  try {
    const filePath = getOnboardedPath();
    if (!fs.existsSync(filePath)) return false;
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return false;
    return (parsed as { onboarded?: unknown }).onboarded === true;
  } catch {
    return false;
  }
}

export function writeOnboardedToDisk(onboarded: boolean): void {
  try {
    const dir = getSharedDataDir();
    fs.mkdirSync(dir, { recursive: true });
    const payload = { onboarded, updatedAt: new Date().toISOString() };
    fs.writeFileSync(getOnboardedPath(), `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  } catch (err) {
    console.warn("[main] writeOnboardedToDisk failed:", err);
  }
}
