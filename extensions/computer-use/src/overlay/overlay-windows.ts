import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { resolveNativeScript } from "../native-paths.js";
import type { OverlayAdapter } from "./overlay-adapter.js";

const overlayScriptPath = resolveNativeScript("windows/agent-overlay.ps1");

const FADE_OUT_WAIT_MS = 400;

export function createWindowsOverlayAdapter(): OverlayAdapter {
  let proc: ChildProcess | null = null;

  return {
    async show() {
      if (proc && proc.exitCode === null) return;

      proc = spawn(
        "powershell.exe",
        ["-ExecutionPolicy", "Bypass", "-NoProfile", "-WindowStyle", "Hidden", "-File", overlayScriptPath],
        {
          stdio: ["pipe", "ignore", "pipe"],
        },
      );
      proc.unref();

      proc.on("error", () => {
        proc = null;
      });
      proc.on("exit", () => {
        proc = null;
      });
    },

    async hide() {
      if (!proc || proc.exitCode !== null) {
        proc = null;
        return;
      }
      // Signal graceful fade-out via stdin (PS1 watches for pipe close)
      try {
        proc.stdin?.write("quit\n");
        proc.stdin?.end();
      } catch {
        // stdin may already be closed
      }
      // Wait for the fade-out animation to finish
      await new Promise((r) => setTimeout(r, FADE_OUT_WAIT_MS));
      // Safety net: kill if still alive after fade-out window
      if (proc && proc.exitCode === null) {
        try {
          proc.kill();
        } catch {
          // already dead
        }
      }
      proc = null;
    },
  };
}
