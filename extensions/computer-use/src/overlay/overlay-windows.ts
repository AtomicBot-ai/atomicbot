import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { resolveNativeScript } from "../native-paths.js";
import type { OverlayAdapter } from "./overlay-adapter.js";

const overlayScriptPath = resolveNativeScript("windows/agent-overlay.ps1");

export function createWindowsOverlayAdapter(): OverlayAdapter {
  let proc: ChildProcess | null = null;

  return {
    async show() {
      if (proc && proc.exitCode === null) return;

      proc = spawn(
        "powershell.exe",
        ["-ExecutionPolicy", "Bypass", "-NoProfile", "-File", overlayScriptPath],
        {
          stdio: "ignore",
          detached: true,
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
      proc.kill("SIGTERM");
      proc = null;
    },
  };
}
