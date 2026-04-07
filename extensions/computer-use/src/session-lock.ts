import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const LOCK_FILENAME = "computer-use.lock";

type LockPayload = {
  readonly sessionKey: string;
  readonly pid: number;
  readonly acquiredAt: number;
};

type AcquireResult =
  | { readonly kind: "acquired"; readonly fresh: boolean }
  | { readonly kind: "blocked"; readonly by: string };

let currentSessionKey: string | undefined;
let cleanupRegistered = false;

function getLockDir(): string {
  return join(homedir(), ".openclaw");
}

function getLockPath(): string {
  return join(getLockDir(), LOCK_FILENAME);
}

async function readLock(): Promise<LockPayload | undefined> {
  try {
    const raw = await readFile(getLockPath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "sessionKey" in parsed &&
      typeof (parsed as LockPayload).sessionKey === "string" &&
      "pid" in parsed &&
      typeof (parsed as LockPayload).pid === "number"
    ) {
      return parsed as LockPayload;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function tryCreateExclusive(payload: LockPayload): Promise<boolean> {
  try {
    await writeFile(getLockPath(), JSON.stringify(payload), { flag: "wx" });
    return true;
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "EEXIST") {
      return false;
    }
    throw e;
  }
}

function registerExitCleanup(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  const onExit = (): void => {
    // Synchronous best-effort cleanup — process.on('exit') cannot await
    const fs = require("node:fs") as typeof import("node:fs");
    try {
      const raw = fs.readFileSync(getLockPath(), "utf8");
      const parsed = JSON.parse(raw) as LockPayload;
      if (parsed.sessionKey === currentSessionKey) {
        fs.unlinkSync(getLockPath());
      }
    } catch {
      // best-effort
    }
  };
  process.on("exit", onExit);
}

export async function tryAcquire(sessionKey: string): Promise<AcquireResult> {
  const payload: LockPayload = { sessionKey, pid: process.pid, acquiredAt: Date.now() };

  await mkdir(getLockDir(), { recursive: true });

  if (await tryCreateExclusive(payload)) {
    currentSessionKey = sessionKey;
    registerExitCleanup();
    return { kind: "acquired", fresh: true };
  }

  const existing = await readLock();

  if (!existing) {
    await unlink(getLockPath()).catch(() => {});
    if (await tryCreateExclusive(payload)) {
      currentSessionKey = sessionKey;
      registerExitCleanup();
      return { kind: "acquired", fresh: true };
    }
    return { kind: "blocked", by: (await readLock())?.sessionKey ?? "unknown" };
  }

  if (existing.sessionKey === sessionKey) {
    currentSessionKey = sessionKey;
    return { kind: "acquired", fresh: false };
  }

  if (isProcessRunning(existing.pid)) {
    return { kind: "blocked", by: existing.sessionKey };
  }

  // Stale lock — owning process is dead, recover
  await unlink(getLockPath()).catch(() => {});
  if (await tryCreateExclusive(payload)) {
    currentSessionKey = sessionKey;
    registerExitCleanup();
    return { kind: "acquired", fresh: true };
  }
  return { kind: "blocked", by: (await readLock())?.sessionKey ?? "unknown" };
}

export async function releaseLock(): Promise<boolean> {
  if (!currentSessionKey) return false;

  const existing = await readLock();
  if (!existing || existing.sessionKey !== currentSessionKey) return false;

  try {
    await unlink(getLockPath());
    currentSessionKey = undefined;
    return true;
  } catch {
    return false;
  }
}

export function isLockHeldLocally(): boolean {
  return currentSessionKey !== undefined;
}
