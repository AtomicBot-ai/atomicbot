import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { resolveNativeScript } from "../native-paths.js";
import type { OverlayAdapter } from "./overlay-adapter.js";

const overlayScriptPath = resolveNativeScript("macos/agent-overlay.swift");

const FADE_OUT_WAIT_MS = 400;

export function createMacOsOverlayAdapter(): OverlayAdapter {
  let proc: ChildProcess | null = null;

  return {
    async show() {
      if (proc && proc.exitCode === null) return;

      proc = spawn("xcrun", ["swift", overlayScriptPath], {
        stdio: "ignore",
        detached: true,
      });
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
      // SIGTERM triggers the graceful fade-out animation in the Swift script
      proc.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, FADE_OUT_WAIT_MS));
      proc = null;
    },
  };
}
