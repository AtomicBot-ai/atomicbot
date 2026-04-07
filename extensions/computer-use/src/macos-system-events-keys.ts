import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SCRIPT_TIMEOUT_MS = 20_000;

export type SystemEventsKeyResult = { ok: boolean; error?: string };

function appleScriptStringLiteral(text: string): string {
  return text.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function runAppleScript(script: string): Promise<SystemEventsKeyResult> {
  // Split script into -e arguments — avoids stdin piping that can hang
  const lines = script.split("\n").filter((l) => l.trim().length > 0);
  const args: string[] = [];
  for (const line of lines) {
    args.push("-e", line);
  }
  try {
    await execFileAsync("osascript", args, {
      encoding: "utf8",
      timeout: SCRIPT_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { ok: true };
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException & { stderr?: string };
    const stderr = typeof err.stderr === "string" ? err.stderr.trim() : "";
    const msg = [err.message, stderr].filter(Boolean).join(": ");
    return { ok: false, error: msg || "osascript failed" };
  }
}

type ParsedMods = { cmd: boolean; alt: boolean; ctrl: boolean; shift: boolean };

function applyModifierToken(token: string, mods: ParsedMods): boolean {
  const t = token.toLowerCase();
  if (t === "cmd" || t === "command" || t === "meta") {
    mods.cmd = true;
    return true;
  }
  if (t === "alt" || t === "option") {
    mods.alt = true;
    return true;
  }
  if (t === "ctrl" || t === "control") {
    mods.ctrl = true;
    return true;
  }
  if (t === "shift") {
    mods.shift = true;
    return true;
  }
  return false;
}

function usingClause(mods: ParsedMods): string {
  const parts: string[] = [];
  if (mods.cmd) parts.push("command down");
  if (mods.alt) parts.push("option down");
  if (mods.ctrl) parts.push("control down");
  if (mods.shift) parts.push("shift down");
  return parts.length > 0 ? ` using {${parts.join(", ")}}` : "";
}

/** AppleScript key codes (System Events), not CG virtual key codes. */
const NAMED_KEY_CODE: Record<string, number> = {
  return: 36,
  enter: 36,
  tab: 48,
  escape: 53,
  esc: 53,
  backspace: 51,
  delete: 117,
  left: 123,
  right: 124,
  down: 125,
  up: 126,
  home: 115,
  end: 119,
  pageup: 116,
  pagedown: 121,
  f1: 122,
  f2: 120,
  f3: 99,
  f4: 118,
  f5: 96,
  f6: 97,
  f7: 98,
  f8: 100,
  f9: 101,
  f10: 109,
  f11: 103,
  f12: 111,
};

function parsePressChord(keys: string): { main: string; mods: ParsedMods } | null {
  const mods: ParsedMods = { cmd: false, alt: false, ctrl: false, shift: false };
  let main: string | null = null;
  for (const part of keys.split("+")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (applyModifierToken(trimmed, mods)) continue;
    if (main !== null) return null;
    main = trimmed;
  }
  if (!main) return null;
  return { main, mods };
}

function pressActionLine(main: string, mods: ParsedMods): string | null {
  const u = usingClause(mods);
  const low = main.toLowerCase();
  if (low === "space") {
    return `    keystroke space${u}`;
  }
  const code = NAMED_KEY_CODE[low];
  if (code !== undefined) {
    return `    key code ${code}${u}`;
  }
  if (main.length === 1) {
    return `    keystroke "${appleScriptStringLiteral(main)}"${u}`;
  }
  return null;
}

/**
 * Keyboard injection via System Events — often succeeds for Spotlight / menu shortcuts
 * when raw CGEvent posting does not.
 */
export async function macOSSystemEventsPress(keys: string): Promise<SystemEventsKeyResult> {
  if (process.platform !== "darwin") {
    return { ok: false, error: "not darwin" };
  }
  const parsed = parsePressChord(keys);
  if (!parsed) {
    return { ok: false, error: "invalid key chord" };
  }
  const action = pressActionLine(parsed.main, parsed.mods);
  if (!action) {
    return { ok: false, error: `unknown key: ${parsed.main}` };
  }
  const script = `tell application "System Events"
  delay 0.02
${action}
end tell
`;
  const result = await runAppleScript(script);
  return result;
}

const TYPE_CHUNK_CHARS = 400;

function buildTypeScript(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines: string[] = ['tell application "System Events"', "  delay 0.02"];
  const rows = normalized.split("\n");
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    if (rowIdx > 0) {
      lines.push("    key code 36");
    }
    const row = rows[rowIdx];
    const chars = Array.from(row);
    for (let i = 0; i < chars.length; i += TYPE_CHUNK_CHARS) {
      const part = chars.slice(i, i + TYPE_CHUNK_CHARS).join("");
      if (part.length > 0) {
        lines.push(`    keystroke "${appleScriptStringLiteral(part)}"`);
      }
    }
  }
  lines.push("end tell");
  return lines.join("\n");
}

export async function macOSSystemEventsType(text: string): Promise<SystemEventsKeyResult> {
  if (process.platform !== "darwin") {
    return { ok: false, error: "not darwin" };
  }
  if (!text) {
    return { ok: true };
  }
  return runAppleScript(buildTypeScript(text));
}
