import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { getPlatform } from "../platform";

const GOG_KEYRING_SECRET_FILE = "gog-keyring";
const SECRET_BYTE_LENGTH = 32;

/**
 * Read or generate a per-installation keyring password stored in stateDir.
 * The file is created with owner-only permissions (0600).
 */
export function ensureGogKeyringSecret(stateDir: string): string {
  const secretPath = path.join(stateDir, GOG_KEYRING_SECRET_FILE);
  try {
    const existing = fs.readFileSync(secretPath, "utf-8").trim();
    if (existing) return existing;
  } catch {
    // File doesn't exist yet — generate below.
  }

  const secret = randomBytes(SECRET_BYTE_LENGTH).toString("base64url");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(secretPath, secret, { encoding: "utf-8" });
  try {
    getPlatform().restrictFilePermissions(secretPath);
  } catch {
    // Best-effort; non-critical on platforms without chmod.
  }
  return secret;
}

/**
 * On macOS, return env vars that force gogcli to use an encrypted file
 * backend instead of Keychain, eliminating repeated approval popups.
 * On other platforms, return an empty object (native keyring works fine).
 */
export function getGogKeyringEnv(stateDir: string): Record<string, string> {
  if (process.platform !== "darwin") return {};
  const secret = ensureGogKeyringSecret(stateDir);
  return {
    GOG_KEYRING_BACKEND: "file",
    GOG_KEYRING_PASSWORD: secret,
  };
}
