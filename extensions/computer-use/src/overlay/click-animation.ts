import { spawn } from "node:child_process";
import { resolveNativeScript } from "../native-paths.js";

const macScriptPath = resolveNativeScript("macos/click-animation.swift");
const winScriptPath = resolveNativeScript("windows/click-animation.ps1");

/**
 * Fire-and-forget ripple animation at the given screen coordinates.
 * The spawned process auto-terminates after the animation completes.
 */
export function playClickAnimation(screenX: number, screenY: number): void {
  try {
    const platform = process.platform;
    let proc;

    if (platform === "darwin") {
      proc = spawn("xcrun", ["swift", macScriptPath, String(screenX), String(screenY)], {
        stdio: "ignore",
        detached: true,
      });
    } else if (platform === "win32") {
      proc = spawn(
        "powershell.exe",
        [
          "-ExecutionPolicy",
          "Bypass",
          "-NoProfile",
          "-File",
          winScriptPath,
          "-X",
          String(screenX),
          "-Y",
          String(screenY),
        ],
        {
          stdio: "ignore",
          detached: true,
        },
      );
    } else {
      return;
    }

    proc.unref();
    proc.on("error", () => {});
  } catch {
    // non-critical visual effect
  }
}
