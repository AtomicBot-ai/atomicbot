import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import {
  shouldUseClipboard,
  typeViaClipboard,
  clipboardRead,
  clipboardWrite,
  getPlatform,
} from "./clipboard-type.js";
import { mapToScreen, storeCoordMap } from "./coord-mapping.js";
import {
  getActiveDebugArtifactRunId,
  saveDebugImageArtifact,
  saveDebugOcrArtifact,
} from "./debug-artifacts.js";
import { buildOcrLayout, recognizeText, summarizeOcr } from "./ocr/index.js";
import type { ToolResult } from "./types.js";
import { abortedResult } from "./types.js";
import {
  screenshot,
  click,
  typeText,
  press,
  scroll,
  mousePosition,
  displayList,
  mouseMove,
  drag,
} from "./usecomputer-native.js";
import { storeCaptureContext } from "./visual-context.js";

const execFileAsync = promisify(execFile);

// Anthropic-recommended target resolutions for model accuracy.
// Models perform best with images at these standard sizes.
const SCALING_TARGETS = [
  { name: "XGA", width: 1024, height: 768 },
  { name: "WXGA", width: 1280, height: 800 },
  { name: "FWXGA", width: 1366, height: 768 },
] as const;

const ASPECT_RATIO_TOLERANCE = 0.06;

function selectScalingTarget(
  screenWidth: number,
  screenHeight: number,
): { width: number; height: number } | null {
  const ratio = screenWidth / screenHeight;
  for (const target of SCALING_TARGETS) {
    const targetRatio = target.width / target.height;
    if (Math.abs(targetRatio - ratio) < ASPECT_RATIO_TOLERANCE && target.width < screenWidth) {
      return { width: target.width, height: target.height };
    }
  }
  return null;
}

// ── Screenshot ───────────────────────────────────────────────

export async function executeScreenshot(params: {
  displayIndex?: number;
  signal?: AbortSignal;
  disableDownscale?: boolean;
  captureSource?: "screenshot" | "screenshot_full";
}): Promise<ToolResult> {
  if (params.signal?.aborted) return abortedResult();

  const result = await screenshot({
    display: params.displayIndex ?? null,
    path: null,
    window: null,
    region: null,
    annotate: true,
  });

  if (params.signal?.aborted) return abortedResult();

  const screenW = result.captureWidth;
  const screenH = result.captureHeight;
  const originX = result.captureX ?? 0;
  const originY = result.captureY ?? 0;

  let finalWidth = result.imageWidth;
  let finalHeight = result.imageHeight;
  let scaledDown = false;

  // Downscale to a model-friendly resolution (Anthropic approach).
  // Smaller, standard-sized images improve model coordinate accuracy.
  const target = selectScalingTarget(screenW, screenH);
  if (target && process.platform === "darwin" && !params.disableDownscale) {
    try {
      await execFileAsync("sips", [
        "-z",
        String(target.height),
        String(target.width),
        result.path,
        "--out",
        result.path,
      ]);
      finalWidth = target.width;
      finalHeight = target.height;
      scaledDown = true;
    } catch {
      // sips failed — fall back to native image
    }
  }

  const coordMap = scaledDown
    ? `${originX},${originY},${screenW},${screenH},${finalWidth},${finalHeight}`
    : result.coordMap;
  storeCoordMap(coordMap);
  storeCaptureContext({
    source: params.captureSource ?? "screenshot",
    captureX: originX,
    captureY: originY,
    captureWidth: screenW,
    captureHeight: screenH,
    imageWidth: finalWidth,
    imageHeight: finalHeight,
    scaledDown,
  });

  const shouldRunOcr = params.captureSource === "screenshot_full";
  const ocrResult = shouldRunOcr
    ? await recognizeText({
        imagePath: result.path,
        imageWidth: finalWidth,
        imageHeight: finalHeight,
        signal: params.signal,
      })
    : null;
  const ocrSummary = summarizeOcr(ocrResult);
  const ocrLayout = buildOcrLayout(ocrResult);
  const screenshotAction =
    params.captureSource === "screenshot_full" ? "screenshot_full" : "screenshot";

  await saveDebugImageArtifact({
    runId: getActiveDebugArtifactRunId(),
    fileStem: screenshotAction,
    imagePath: result.path,
  });
  await saveDebugOcrArtifact({
    runId: getActiveDebugArtifactRunId(),
    fileStem: `${screenshotAction}-ocr`,
    ocrResult,
  });

  const buf = await fs.readFile(result.path);
  const base64 = buf.toString("base64");

  fs.unlink(result.path).catch(() => {});

  const hintPrefix =
    screenshotAction === "screenshot_full"
      ? "Full-resolution screenshot captured"
      : "Screenshot captured";
  const hint =
    `${hintPrefix} (${finalWidth}x${finalHeight}) with grid overlay. Coordinates from this image are automatically scaled to match screen points. ` +
    `If you need to launch or switch to an app by name, prefer open_app instead of clicking dock icons from the screenshot. ` +
    `Read x/y from the visible grid intersections and OCR anchors instead of estimating fractions of the screen.` +
    (ocrSummary ? ` ${ocrSummary.text}` : "") +
    (ocrLayout ? ` ${ocrLayout.promptHint}` : "");

  return {
    content: [
      { type: "text", text: hint },
      { type: "image", data: base64, mimeType: "image/png" },
    ],
    details: {
      action: screenshotAction,
      imageWidth: finalWidth,
      imageHeight: finalHeight,
      captureWidth: screenW,
      captureHeight: screenH,
      desktopIndex: result.desktopIndex,
      scaledDown,
      ocrSummary: ocrSummary?.text ?? null,
      ocrMatchesCount: ocrSummary?.matchesCount ?? 0,
      ocrEngine: ocrSummary?.engine ?? null,
      ocrAnchors: ocrSummary?.anchors ?? [],
      ocrLayout,
    },
  };
}

// ── Click ────────────────────────────────────────────────────

export async function executeClick(params: {
  x: number;
  y: number;
  button: string;
  count: number;
  signal?: AbortSignal;
}): Promise<ToolResult> {
  if (params.signal?.aborted) return abortedResult();

  if (typeof params.x !== "number" || typeof params.y !== "number") {
    return {
      content: [{ type: "text", text: "click requires x and y coordinates" }],
      details: { status: "failed", action: "click" },
    };
  }

  const mapped = mapToScreen(params.x, params.y);

  await click({
    point: mapped,
    button: (params.button as "left" | "right" | "middle") ?? "left",
    count: params.count ?? 1,
    modifiers: [],
  });

  // Wait for cursor to settle before reading position
  await new Promise((r) => setTimeout(r, 50));
  const cursorPos = await mousePosition();

  return {
    content: [
      {
        type: "text",
        text: `Clicked ${params.button ?? "left"} at (${mapped.x}, ${mapped.y}). Cursor now at (${cursorPos.x}, ${cursorPos.y}). Take a screenshot to verify the result.`,
      },
    ],
    details: {
      action: "click",
      requestedX: params.x,
      requestedY: params.y,
      screenX: mapped.x,
      screenY: mapped.y,
      cursorX: cursorPos.x,
      cursorY: cursorPos.y,
    },
  };
}

// ── Type ─────────────────────────────────────────────────────

const UNICODE_MODIFIER_MAP: Record<string, string> = {
  "⌘": "cmd",
  "⌥": "alt",
  "⌃": "ctrl",
  "⇧": "shift",
};

const UNICODE_MODIFIER_RE = /[⌘⌥⌃⇧]/;

/**
 * Detect when text looks like a keyboard shortcut with Unicode modifier symbols
 * (e.g. "⌘V", "⌘⇧S") and convert to press-compatible key combo (e.g. "cmd+v", "cmd+shift+s").
 * Returns null if the text is not a shortcut pattern.
 */
function parseUnicodeShortcut(text: string): string | null {
  if (!UNICODE_MODIFIER_RE.test(text)) return null;

  const modifiers: string[] = [];
  let remaining = text;

  for (const [symbol, name] of Object.entries(UNICODE_MODIFIER_MAP)) {
    if (remaining.includes(symbol)) {
      modifiers.push(name);
      remaining = remaining.replaceAll(symbol, "");
    }
  }

  remaining = remaining.trim();
  if (modifiers.length === 0 || remaining.length === 0) return null;

  return [...modifiers, remaining.toLowerCase()].join("+");
}

export async function executeType(params: {
  text: string;
  signal?: AbortSignal;
}): Promise<ToolResult> {
  if (params.signal?.aborted) return abortedResult();

  if (!params.text) {
    return {
      content: [{ type: "text", text: "type requires text parameter" }],
      details: { status: "failed", action: "type" },
    };
  }

  // Auto-redirect Unicode modifier shortcuts (e.g. "⌘V") to press
  const shortcut = parseUnicodeShortcut(params.text);
  if (shortcut) {
    return executePress({ keys: shortcut, signal: params.signal });
  }

  let method = "direct";
  if (shouldUseClipboard(params.text)) {
    const result = await typeViaClipboard(params.text, params.signal);
    method = result.method;
  } else {
    await typeText({ text: params.text, delayMs: null });
  }

  return {
    content: [{ type: "text", text: `Typed: ${params.text}` }],
    details: { action: "type", text: params.text, method },
  };
}

// ── Press ────────────────────────────────────────────────────

export async function executePress(params: {
  keys: string;
  signal?: AbortSignal;
}): Promise<ToolResult> {
  if (params.signal?.aborted) return abortedResult();

  if (!params.keys) {
    return {
      content: [{ type: "text", text: "press requires keys parameter (e.g. 'cmd+s', 'enter')" }],
      details: { status: "failed", action: "press" },
    };
  }

  await press({ key: params.keys, count: 1, delayMs: null });

  return {
    content: [{ type: "text", text: `Pressed: ${params.keys}` }],
    details: { action: "press", keys: params.keys },
  };
}

export async function executeSubmitInput(params: { signal?: AbortSignal }): Promise<ToolResult> {
  if (params.signal?.aborted) return abortedResult();

  await press({ key: "enter", count: 1, delayMs: null });

  return {
    content: [{ type: "text", text: "Submitted the current input with Enter." }],
    details: { action: "submit_input", keys: "enter" },
  };
}

// ── Scroll ───────────────────────────────────────────────────

export async function executeScroll(params: {
  x?: number;
  y?: number;
  direction: "up" | "down" | "left" | "right";
  amount: number;
  signal?: AbortSignal;
}): Promise<ToolResult> {
  if (params.signal?.aborted) return abortedResult();

  const at =
    typeof params.x === "number" && typeof params.y === "number"
      ? mapToScreen(params.x, params.y)
      : null;

  await scroll({
    direction: params.direction,
    amount: params.amount,
    at,
  });

  const posText = at ? ` at (${params.x}, ${params.y})` : "";
  return {
    content: [{ type: "text", text: `Scrolled ${params.direction} by ${params.amount}${posText}` }],
    details: { action: "scroll", direction: params.direction, amount: params.amount },
  };
}

// ── Cursor position ──────────────────────────────────────────

export async function executeCursorPosition(): Promise<ToolResult> {
  const pos = await mousePosition();
  return {
    content: [{ type: "text", text: `Cursor position: (${pos.x}, ${pos.y})` }],
    details: { action: "cursor_position", x: pos.x, y: pos.y },
  };
}

// ── Display list ─────────────────────────────────────────────

export async function executeDisplayList(): Promise<ToolResult> {
  const displays = await displayList();
  const text = displays
    .map(
      (d) =>
        `Display ${d.index}: ${d.name} (${d.width}x${d.height}, scale=${d.scale}${d.isPrimary ? ", primary" : ""})`,
    )
    .join("\n");

  return {
    content: [{ type: "text", text: text || "No displays found" }],
    details: { action: "display_list", displays },
  };
}

// ── Mouse move ──────────────────────────────────────────────

export async function executeMouseMove(params: {
  x: number;
  y: number;
  signal?: AbortSignal;
}): Promise<ToolResult> {
  if (params.signal?.aborted) return abortedResult();

  if (typeof params.x !== "number" || typeof params.y !== "number") {
    return {
      content: [{ type: "text", text: "mouse_move requires x and y coordinates" }],
      details: { status: "failed", action: "mouse_move" },
    };
  }

  const mapped = mapToScreen(params.x, params.y);
  await mouseMove(mapped);

  return {
    content: [{ type: "text", text: `Moved cursor to (${params.x}, ${params.y})` }],
    details: {
      action: "mouse_move",
      imageX: params.x,
      imageY: params.y,
      screenX: mapped.x,
      screenY: mapped.y,
    },
  };
}

// ── Wait ────────────────────────────────────────────────────

const MAX_WAIT_SECONDS = 30;

export async function executeWait(params: {
  duration: number;
  signal?: AbortSignal;
}): Promise<ToolResult> {
  if (params.signal?.aborted) return abortedResult();

  const seconds = Math.min(Math.max(params.duration ?? 1, 0.1), MAX_WAIT_SECONDS);
  const ms = Math.round(seconds * 1000);

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      if (params.signal) {
        params.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new Error("Aborted"));
          },
          { once: true },
        );
      }
    });
  } catch {
    return abortedResult();
  }

  return {
    content: [
      { type: "text", text: `Waited ${seconds}s. Take a screenshot to see the current UI state.` },
    ],
    details: { action: "wait", durationMs: ms },
  };
}

// ── Drag ────────────────────────────────────────────────────

export async function executeDrag(params: {
  x: number;
  y: number;
  toX: number;
  toY: number;
  signal?: AbortSignal;
}): Promise<ToolResult> {
  if (params.signal?.aborted) return abortedResult();

  if (
    typeof params.x !== "number" ||
    typeof params.y !== "number" ||
    typeof params.toX !== "number" ||
    typeof params.toY !== "number"
  ) {
    return {
      content: [{ type: "text", text: "drag requires x, y, to_x, to_y coordinates" }],
      details: { status: "failed", action: "drag" },
    };
  }

  const from = mapToScreen(params.x, params.y);
  const to = mapToScreen(params.toX, params.toY);
  await drag({ from, to, button: "left" });

  return {
    content: [
      {
        type: "text",
        text: `Dragged from (${params.x}, ${params.y}) to (${params.toX}, ${params.toY})`,
      },
    ],
    details: { action: "drag", fromX: from.x, fromY: from.y, toX: to.x, toY: to.y },
  };
}

// ── Hold key ────────────────────────────────────────────────

export async function executeHoldKey(params: {
  keys: string;
  durationMs: number;
  signal?: AbortSignal;
}): Promise<ToolResult> {
  if (params.signal?.aborted) return abortedResult();

  if (!params.keys) {
    return {
      content: [{ type: "text", text: "hold_key requires text parameter (key combo)" }],
      details: { status: "failed", action: "hold_key" },
    };
  }

  const ms = Math.min(Math.max(params.durationMs ?? 500, 50), 10_000);
  await press({ key: params.keys, count: 1, delayMs: ms });

  return {
    content: [{ type: "text", text: `Held ${params.keys} for ${ms}ms` }],
    details: { action: "hold_key", keys: params.keys, durationMs: ms },
  };
}

// ── Clipboard ───────────────────────────────────────────────

export async function executeReadClipboard(): Promise<ToolResult> {
  const text = await clipboardRead(getPlatform());
  return {
    content: [{ type: "text", text: `Clipboard contents: ${text}` }],
    details: { action: "read_clipboard", length: text.length },
  };
}

export async function executeWriteClipboard(params: { text: string }): Promise<ToolResult> {
  if (!params.text) {
    return {
      content: [{ type: "text", text: "write_clipboard requires text parameter" }],
      details: { status: "failed", action: "write_clipboard" },
    };
  }

  await clipboardWrite(params.text, getPlatform());
  return {
    content: [{ type: "text", text: `Written to clipboard (${params.text.length} chars)` }],
    details: { action: "write_clipboard", length: params.text.length },
  };
}

// ── Open app ────────────────────────────────────────────────

export async function executeOpenApp(params: {
  appName: string;
  signal?: AbortSignal;
}): Promise<ToolResult> {
  if (params.signal?.aborted) return abortedResult();

  if (!params.appName) {
    return {
      content: [{ type: "text", text: "open_app requires app_name parameter" }],
      details: { status: "failed", action: "open_app" },
    };
  }

  const platform = process.platform;
  switch (platform) {
    case "darwin":
      await execFileAsync("open", ["-a", params.appName]);
      break;
    case "linux":
      await execFileAsync("xdg-open", [params.appName]);
      break;
    case "win32":
      await execFileAsync("cmd", ["/c", "start", "", params.appName]);
      break;
    default:
      return {
        content: [{ type: "text", text: `Unsupported platform: ${platform}` }],
        details: { status: "failed", action: "open_app" },
      };
  }

  return {
    content: [
      {
        type: "text",
        text: `Opened application: ${params.appName}. Take a screenshot to see the current state.`,
      },
    ],
    details: { action: "open_app", appName: params.appName },
  };
}
