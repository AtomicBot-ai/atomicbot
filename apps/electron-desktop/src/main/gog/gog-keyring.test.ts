import * as fsp from "node:fs/promises";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureGogKeyringSecret, getGogKeyringEnv } from "./gog-keyring";

describe("ensureGogKeyringSecret", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "gog-keyring-test-"));
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("generates a new secret when none exists", () => {
    const secret = ensureGogKeyringSecret(tmpDir);
    expect(secret).toBeTruthy();
    expect(secret.length).toBeGreaterThan(20);
  });

  it("persists the secret to disk", () => {
    const secret = ensureGogKeyringSecret(tmpDir);
    const onDisk = fs.readFileSync(path.join(tmpDir, "gog-keyring"), "utf-8").trim();
    expect(onDisk).toBe(secret);
  });

  it("returns the same secret on subsequent calls", () => {
    const first = ensureGogKeyringSecret(tmpDir);
    const second = ensureGogKeyringSecret(tmpDir);
    expect(second).toBe(first);
  });

  it("creates stateDir if it does not exist", () => {
    const nested = path.join(tmpDir, "a", "b");
    const secret = ensureGogKeyringSecret(nested);
    expect(secret).toBeTruthy();
    expect(fs.existsSync(path.join(nested, "gog-keyring"))).toBe(true);
  });
});

describe("getGogKeyringEnv", () => {
  let tmpDir: string;
  const originalPlatform = process.platform;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "gog-keyring-env-test-"));
  });

  afterEach(async () => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns keyring env on darwin", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const env = getGogKeyringEnv(tmpDir);
    expect(env.GOG_KEYRING_BACKEND).toBe("file");
    expect(env.GOG_KEYRING_PASSWORD).toBeTruthy();
  });

  it("returns empty object on linux", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    const env = getGogKeyringEnv(tmpDir);
    expect(env).toEqual({});
  });

  it("returns empty object on win32", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const env = getGogKeyringEnv(tmpDir);
    expect(env).toEqual({});
  });

  it("uses the persisted secret from ensureGogKeyringSecret", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const secret = ensureGogKeyringSecret(tmpDir);
    const env = getGogKeyringEnv(tmpDir);
    expect(env.GOG_KEYRING_PASSWORD).toBe(secret);
  });
});
