import type { ChildProcess } from "node:child_process";
import { execSync, spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { Platform } from "./types";

const SENTINEL_FILENAME = "update-splash.pid";
const TEMP_SCRIPT_NAME = "atomicbot-update-splash.js";

// JXA script (JavaScript for Automation) that renders a native macOS window.
// Runs via `osascript -l JavaScript <file> <oldPid> <sentinelPath> <bundleId>`.
const JXA_SCRIPT = /* js */ `
function run(argv) {
  var oldPid = parseInt(argv[0], 10) || 0;
  var sentinelPath = argv[1] || '';
  var bundleId = argv[2] || 'ai.atomicbot.desktop';

  ObjC.import('Cocoa');

  var nsApp = $.NSApplication.sharedApplication;
  nsApp.setActivationPolicy(2);

  if (sentinelPath) {
    var pid = $.NSProcessInfo.processInfo.processIdentifier;
    var pidStr = $.NSString.stringWithFormat('%d', pid);
    pidStr.writeToFileAtomicallyEncodingError(sentinelPath, true, 4, null);
  }

  var W = 360, H = 180;
  var styleMask = 1 | (1 << 15);
  var win = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer(
    $.NSMakeRect(0, 0, W, H), styleMask, 2, false
  );

  win.titlebarAppearsTransparent = true;
  win.titleVisibility = 1;
  win.standardWindowButton(0).hidden = true;
  win.standardWindowButton(1).hidden = true;
  win.standardWindowButton(2).hidden = true;
  win.isMovableByWindowBackground = true;
  win.level = 3;
  win.hasShadow = true;
  win.backgroundColor = $.NSColor.colorWithSRGBRedGreenBlueAlpha(0.043, 0.059, 0.078, 1.0);

  try {
    win.appearance = $.NSAppearance.appearanceNamed('NSAppearanceNameDarkAqua');
  } catch (e) {}

  win.collectionBehavior = 1 << 0;

  var cv = win.contentView;
  var cw = cv.bounds.size.width;
  var ch = cv.bounds.size.height;

  var gapTitleSubtitle = 4;
  var gapLoaderTitle = 14;
  var subtitleH = 20, titleH = 28, spinnerSz = 40;
  var blockH = subtitleH + gapTitleSubtitle + titleH + gapLoaderTitle + spinnerSz;
  var baseY = (ch - blockH) / 2;

  function makeLabel(text, font, color, y, h) {
    var textW = cw;
    var textX = 0;
    try {
      var attrs = $.NSDictionary.dictionaryWithObjectForKey(font, $.NSFontAttributeName);
      var attrStr = $.NSAttributedString.alloc.init.initWithStringAttributes(text, attrs);
      var size = attrStr.size;
      var w = size.width;
      if (typeof w === 'number' && w > 0) {
        textW = Math.min(Math.ceil(w) + 16, cw);
        textX = (cw - textW) / 2;
      }
    } catch (e) {}
    var field = $.NSTextField.alloc.initWithFrame($.NSMakeRect(textX, y, textW, h));
    field.stringValue = text;
    field.setBezeled(false);
    field.setDrawsBackground(false);
    field.setEditable(false);
    field.setSelectable(false);
    field.textColor = color;
    field.font = font;
    field.cell.setAlignment(2);
    return field;
  }

  cv.addSubview(makeLabel(
    'Please wait\\u2026',
    $.NSFont.systemFontOfSize(12),
    $.NSColor.colorWithSRGBRedGreenBlueAlpha(0.55, 0.6, 0.65, 1.0),
    baseY, subtitleH
  ));

  cv.addSubview(makeLabel(
    'Updating Sigma Eclipse\\u2026',
    $.NSFont.systemFontOfSizeWeight(16, 0.5),
    $.NSColor.colorWithSRGBRedGreenBlueAlpha(0.9, 0.93, 0.95, 1.0),
    baseY + subtitleH + gapTitleSubtitle, titleH
  ));

  var spinnerX = (cw - spinnerSz) / 2;
  var spinner = $.NSProgressIndicator.alloc.initWithFrame(
    $.NSMakeRect(spinnerX, baseY + subtitleH + gapTitleSubtitle + titleH + gapLoaderTitle, spinnerSz, spinnerSz)
  );
  spinner.style = 1;
  spinner.displayedWhenStopped = false;
  spinner.startAnimation(null);
  cv.addSubview(spinner);

  var screen = $.NSScreen.mainScreen.frame;
  var cx = (screen.size.width - W) / 2;
  var cy = (screen.size.height - H) / 2;
  win.setFrameDisplayAnimate($.NSMakeRect(cx, cy, W, H), true, false);
  win.makeKeyAndOrderFront(null);
  nsApp.activateIgnoringOtherApps(true);

  var MAX_SECONDS = 120;
  var POLL_INTERVAL = 1.0;
  var elapsed = 0;
  var oldPidDead = (oldPid === 0);

  while (elapsed < MAX_SECONDS) {
    $.NSRunLoop.currentRunLoop.runUntilDate(
      $.NSDate.dateWithTimeIntervalSinceNow(POLL_INTERVAL)
    );
    elapsed += POLL_INTERVAL;

    if (!oldPidDead) {
      var stillRunning = false;
      var allApps = $.NSWorkspace.sharedWorkspace.runningApplications;
      for (var i = 0; i < allApps.count; i++) {
        if (allApps.objectAtIndex(i).processIdentifier === oldPid) {
          stillRunning = true;
          break;
        }
      }
      if (!stillRunning) { oldPidDead = true; }
    }

    if (oldPidDead) {
      var allApps2 = $.NSWorkspace.sharedWorkspace.runningApplications;
      for (var j = 0; j < allApps2.count; j++) {
        var ra = allApps2.objectAtIndex(j);
        var bid = ra.bundleIdentifier;
        if (bid) {
          try {
            if (ObjC.unwrap(bid) === bundleId) {
              $.NSRunLoop.currentRunLoop.runUntilDate(
                $.NSDate.dateWithTimeIntervalSinceNow(2.5)
              );
              cleanup(sentinelPath);
              return;
            }
          } catch (e) {}
        }
      }
    }
  }

  cleanup(sentinelPath);
}

function cleanup(sentinelPath) {
  if (sentinelPath) {
    try {
      $.NSFileManager.defaultManager.removeItemAtPathError(sentinelPath, null);
    } catch (e) {}
  }
}
`;

const FFMPEG_ZIP_URL =
  "https://github.com/AtomicBot-ai/FFmpeg/releases/download/v8.0.1-1/mac-ffmpeg.zip";

export class DarwinPlatform implements Platform {
  readonly name = "darwin" as const;
  readonly keepAliveOnAllWindowsClosed = true;
  readonly trayIconIsTemplate = true;

  init(): void {
    // No special init needed on macOS.
  }

  // ── Process management ──────────────────────────────────────────────────

  killProcess(pid: number, opts?: { force?: boolean }): void {
    const signal = opts?.force ? "SIGKILL" : "SIGTERM";
    process.kill(pid, signal);
  }

  killProcessTree(pid: number): void {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Already dead.
      }
    }
  }

  killAllByName(name: string): void {
    try {
      execSync(`pkill -9 ${name}`, { stdio: "ignore" });
    } catch {
      // pkill exits non-zero when no matching processes found — expected.
    }
  }

  isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  forceKillChild(child: ChildProcess): void {
    child.kill("SIGKILL");
  }

  // ── Gateway spawn config ────────────────────────────────────────────────

  gatewaySpawnOptions() {
    return {
      detached: true,
      extraArgs: ["--force"],
      startupTimeoutMs: 60_000,
    };
  }

  // ── Shell / Terminal ────────────────────────────────────────────────────

  defaultShell(): string {
    return process.env.SHELL || "/bin/sh";
  }

  createCliWrapper(params: {
    binDir: string;
    name: string;
    nodeBin: string;
    scriptPath: string;
  }): string {
    const wrapperPath = path.join(params.binDir, params.name);
    try {
      fs.unlinkSync(wrapperPath);
    } catch {
      // may not exist
    }
    const isAbsoluteNodeBin = path.isAbsolute(params.nodeBin);
    const nodeCmd = isAbsoluteNodeBin ? params.nodeBin : "node";
    const script = ["#!/bin/sh", `exec "${nodeCmd}" "${params.scriptPath}" "$@"`, ""].join("\n");
    fs.writeFileSync(wrapperPath, script, { mode: 0o755 });
    return wrapperPath;
  }

  // ── Binary paths ────────────────────────────────────────────────────────

  binaryExtension(): string {
    return "";
  }

  ffmpegBinaryName(): string {
    return "ffmpeg";
  }

  ffmpegDownloadUrl(): string | null {
    return FFMPEG_ZIP_URL;
  }

  appConfigSearchPaths(appName: string): string[] {
    const paths: string[] = [];
    const xdg = process.env.XDG_CONFIG_HOME;
    if (xdg) {
      paths.push(path.join(xdg, appName));
    }
    paths.push(path.join(os.homedir(), ".config", appName));
    paths.push(path.join(os.homedir(), "Library", "Application Support", appName));
    return paths;
  }

  obsidianConfigPath(): string {
    // DarwinPlatform is also used for linux (see platform/index.ts).
    if (process.platform === "linux") {
      return path.join(os.homedir(), ".config", "obsidian", "obsidian.json");
    }
    return path.join(os.homedir(), "Library", "Application Support", "obsidian", "obsidian.json");
  }

  // ── File system ─────────────────────────────────────────────────────────

  restrictFilePermissions(filePath: string): void {
    fs.chmodSync(filePath, 0o600);
  }

  makeExecutable(filePath: string): void {
    fs.chmodSync(filePath, 0o755);
  }

  removeQuarantine(filePath: string): void {
    spawnSync("xattr", ["-dr", "com.apple.quarantine", filePath]);
  }

  extractZip(zipPath: string, destDir: string): void {
    const res = spawnSync("unzip", ["-q", zipPath, "-d", destDir], {
      encoding: "utf-8",
    });
    if (res.status !== 0) {
      throw new Error(`Failed to extract zip: ${String(res.stderr || "").trim()}`);
    }
  }

  // ── Update splash ──────────────────────────────────────────────────────

  showUpdateSplash(params: { stateDir: string; pid: number; bundleId: string }): void {
    try {
      fs.mkdirSync(params.stateDir, { recursive: true });
      const sentinelPath = path.join(params.stateDir, SENTINEL_FILENAME);
      const scriptPath = path.join(os.tmpdir(), TEMP_SCRIPT_NAME);
      fs.writeFileSync(scriptPath, JXA_SCRIPT, "utf-8");

      const child = spawn(
        "osascript",
        ["-l", "JavaScript", scriptPath, String(params.pid), sentinelPath, params.bundleId],
        { detached: true, stdio: "ignore" }
      );
      child.unref();
    } catch (err) {
      console.warn("[platform/darwin] showUpdateSplash failed:", err);
    }
  }

  killUpdateSplash(params: { stateDir: string }): void {
    try {
      const sentinelPath = path.join(params.stateDir, SENTINEL_FILENAME);
      if (!fs.existsSync(sentinelPath)) {
        return;
      }
      const raw = fs.readFileSync(sentinelPath, "utf-8").trim();
      const pid = parseInt(raw, 10);
      if (pid > 0) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // already dead
        }
      }
      fs.unlinkSync(sentinelPath);
    } catch (err) {
      console.warn("[platform/darwin] killUpdateSplash failed:", err);
    }
  }

  // ── Lock file ───────────────────────────────────────────────────────────

  gatewayLockDirSuffix(): string {
    const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
    return uid != null ? `openclaw-${uid}` : "openclaw";
  }
}
