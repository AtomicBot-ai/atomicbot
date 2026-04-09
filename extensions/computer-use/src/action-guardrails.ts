import type { ToolResult } from "./types.js";
import { getLastCaptureContext, getRecentTextEntry } from "./visual-context.js";

type ClickLikeAction = "click" | "double_click" | "triple_click" | "drag";

function blockedResult(params: { action: string; reason: string; text: string }): ToolResult {
  return {
    content: [{ type: "text", text: params.text }],
    details: {
      status: "blocked",
      action: params.action,
      reason: params.reason,
    },
  };
}

function isFullScreenshotContext(): boolean {
  const capture = getLastCaptureContext();
  return Boolean(
    capture && (capture.source === "screenshot" || capture.source === "screenshot_full"),
  );
}

function isLikelyLauncherZone(y: number, imageHeight: number): boolean {
  return y >= imageHeight * 0.82;
}

function isLikelySubmitZone(
  x: number,
  y: number,
  imageWidth: number,
  imageHeight: number,
): boolean {
  return x >= imageWidth * 0.65 && y >= imageHeight * 0.65;
}

export function evaluateActionGuardrail(params: {
  action: string;
  x?: number;
  y?: number;
}): ToolResult | null {
  if (!isFullScreenshotContext()) {
    return null;
  }

  const capture = getLastCaptureContext();
  if (!capture) {
    return null;
  }

  const clickLikeAction = new Set<ClickLikeAction>([
    "click",
    "double_click",
    "triple_click",
    "drag",
  ]);
  if (!clickLikeAction.has(params.action as ClickLikeAction)) {
    return null;
  }

  if (typeof params.x !== "number" || typeof params.y !== "number") {
    return null;
  }

  const recentTextEntry = getRecentTextEntry();
  if (
    recentTextEntry &&
    isLikelySubmitZone(params.x, params.y, capture.imageWidth, capture.imageHeight)
  ) {
    return blockedResult({
      action: params.action,
      reason: "submit_input_preferred",
      text: "Direct click blocked: after typing text on a full-screen screenshot, prefer 'submit_input' or 'press' with 'enter' instead of guessing the send button. If Enter is not correct, take a zoomed screenshot of the input area first.",
    });
  }

  if (isLikelyLauncherZone(params.y, capture.imageHeight)) {
    return blockedResult({
      action: params.action,
      reason: "open_app_preferred",
      text: "Direct click blocked: this target is in the launcher or dock area of a full-screen screenshot. Prefer 'open_app' or 'switch_app' by name instead of guessing an app icon from the screenshot.",
    });
  }

  return null;
}
