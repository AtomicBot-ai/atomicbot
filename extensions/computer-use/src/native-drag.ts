import { spawn } from "node:child_process";
import { resolveNativeScript } from "./native-paths.js";

const macScriptPath = resolveNativeScript("macos/drag.swift");
const winScriptPath = resolveNativeScript("windows/drag.ps1");

/**
 * Perform a drag using a native script that emits proper drag events.
 *
 * macOS: uses kCGEventLeftMouseDragged instead of kCGEventMouseMoved.
 * Windows: uses SendInput with MOUSEEVENTF_MOVE instead of SetCursorPos.
 *
 * The usecomputer bridge's drag uses move primitives that apps don't
 * recognize as drag gestures, so files won't follow the cursor.
 */
export function nativeDrag(
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  return new Promise((resolve, reject) => {
    let proc;
    const platform = process.platform;

    if (platform === "darwin") {
      proc = spawn(
        "xcrun",
        ["swift", macScriptPath, String(from.x), String(from.y), String(to.x), String(to.y)],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
    } else if (platform === "win32") {
      proc = spawn(
        "powershell.exe",
        [
          "-ExecutionPolicy",
          "Bypass",
          "-NoProfile",
          "-File",
          winScriptPath,
          "-FromX",
          String(from.x),
          "-FromY",
          String(from.y),
          "-ToX",
          String(to.x),
          "-ToY",
          String(to.y),
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
    } else {
      resolve();
      return;
    }

    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`drag script exited with code ${code}: ${stderr.trim()}`));
      }
    });
  });
}
