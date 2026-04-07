import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { press } from "./usecomputer-native.js";

const execFileAsync = promisify(execFile);

function spawnWithInput(command: string, args: string[], input: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}: ${stderr}`));
    });
    child.stdin.end(input);
  });
}

const CLIPBOARD_THRESHOLD = 32;

const PASTE_SETTLE_MS = 100;

type Platform = "darwin" | "linux" | "win32";

export function getPlatform(): Platform {
  const p = process.platform;
  if (p === "darwin" || p === "linux" || p === "win32") return p;
  return "linux";
}

export async function clipboardRead(platform: Platform): Promise<string> {
  switch (platform) {
    case "darwin": {
      const { stdout } = await execFileAsync("pbpaste", []);
      return stdout;
    }
    case "linux": {
      const { stdout } = await execFileAsync("xclip", ["-selection", "clipboard", "-o"]);
      return stdout;
    }
    case "win32": {
      const { stdout } = await execFileAsync("powershell", ["-Command", "Get-Clipboard"]);
      return stdout.replace(/\r\n$/, "");
    }
  }
}

export async function clipboardWrite(text: string, platform: Platform): Promise<void> {
  switch (platform) {
    case "darwin":
      return spawnWithInput("pbcopy", [], text);
    case "linux":
      return spawnWithInput("xclip", ["-selection", "clipboard"], text);
    case "win32": {
      await execFileAsync("powershell", [
        "-Command",
        `Set-Clipboard -Value '${text.replace(/'/g, "''")}'`,
      ]);
      return;
    }
  }
}

function pasteModifier(platform: Platform): string {
  return platform === "darwin" ? "cmd+v" : "ctrl+v";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function shouldUseClipboard(text: string): boolean {
  return text.length > CLIPBOARD_THRESHOLD;
}

export async function typeViaClipboard(
  text: string,
  signal?: AbortSignal,
): Promise<{ method: "clipboard"; restored: boolean }> {
  const platform = getPlatform();

  let savedClipboard: string | undefined;
  let restored = false;

  try {
    if (signal?.aborted) throw new Error("Aborted");

    savedClipboard = await clipboardRead(platform).catch(() => undefined);

    if (signal?.aborted) throw new Error("Aborted");

    await clipboardWrite(text, platform);

    const verify = await clipboardRead(platform).catch(() => "");
    if (verify !== text) {
      throw new Error("Clipboard write verification failed");
    }

    if (signal?.aborted) throw new Error("Aborted");

    await press({ key: pasteModifier(platform), count: 1, delayMs: null });

    await sleep(PASTE_SETTLE_MS);
  } finally {
    if (savedClipboard !== undefined) {
      await clipboardWrite(savedClipboard, platform).catch(() => {});
      restored = true;
    }
  }

  return { method: "clipboard", restored };
}
