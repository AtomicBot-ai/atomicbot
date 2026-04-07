import fs from "node:fs/promises";
import { getLastCoordMap, mapToScreen, storeCoordMap } from "./coord-mapping.js";
import {
  getActiveDebugArtifactRunId,
  saveDebugImageArtifact,
  saveDebugOcrArtifact,
} from "./debug-artifacts.js";
import { buildOcrLayout, recognizeText, summarizeOcr } from "./ocr/index.js";
import { mousePosition, screenshot } from "./usecomputer-native.js";
import { storeCaptureContext } from "./visual-context.js";

type TextContent = { type: "text"; text: string };
type ImageContent = { type: "image"; data: string; mimeType: string };
type ToolResult = {
  content: Array<TextContent | ImageContent>;
  details: Record<string, unknown>;
};

const DEFAULT_ZOOM_CURSOR_WIDTH = 400;
const DEFAULT_ZOOM_CURSOR_HEIGHT = 300;

function abortedResult(): ToolResult {
  return { content: [{ type: "text", text: "Aborted" }], details: { status: "aborted" } };
}

async function createZoomResult(params: {
  region: { x: number; y: number; width: number; height: number };
  displayIndex?: number;
  text: string;
  source: "zoom" | "zoom_cursor";
  signal?: AbortSignal;
}): Promise<ToolResult> {
  const result = await screenshot({
    display: params.displayIndex ?? null,
    path: null,
    window: null,
    region: params.region,
    annotate: true,
  });

  const buffer = await fs.readFile(result.path);
  const base64 = buffer.toString("base64");
  storeCoordMap(result.coordMap);
  storeCaptureContext({
    source: params.source,
    captureX: result.captureX,
    captureY: result.captureY,
    captureWidth: result.captureWidth,
    captureHeight: result.captureHeight,
    imageWidth: result.imageWidth,
    imageHeight: result.imageHeight,
    scaledDown: false,
  });
  const ocrResult = await recognizeText({
    imagePath: result.path,
    imageWidth: result.imageWidth,
    imageHeight: result.imageHeight,
    signal: params.signal,
  });
  const ocrSummary = summarizeOcr(ocrResult);
  const ocrLayout = buildOcrLayout(ocrResult);
  await saveDebugImageArtifact({
    runId: getActiveDebugArtifactRunId(),
    fileStem: params.source,
    imagePath: result.path,
  });
  await saveDebugOcrArtifact({
    runId: getActiveDebugArtifactRunId(),
    fileStem: `${params.source}-ocr`,
    ocrResult,
  });
  const coordMap = getLastCoordMap();
  await fs.unlink(result.path).catch(() => {});

  return {
    content: [
      {
        type: "text",
        text:
          `${params.text} This zoomed image includes a grid overlay. ` +
          `Treat it as a fresh local coordinate space where the top-left corner is (0, 0). ` +
          `Choose the next click from this crop's grid, not from the previous screenshot.` +
          (ocrSummary ? ` ${ocrSummary.text}` : "") +
          (ocrLayout ? ` ${ocrLayout.promptHint}` : ""),
      },
      { type: "image", data: base64, mimeType: "image/png" },
    ],
    details: {
      action: "zoom",
      x: params.region.x,
      y: params.region.y,
      width: params.region.width,
      height: params.region.height,
      ocrSummary: ocrSummary?.text ?? null,
      ocrMatchesCount: ocrSummary?.matchesCount ?? 0,
      ocrEngine: ocrSummary?.engine ?? null,
      ocrAnchors: ocrSummary?.anchors ?? [],
      ocrLayout,
    },
  };
}

export async function executeZoom(params: {
  x: number;
  y: number;
  width: number;
  height: number;
  displayIndex?: number;
  signal?: AbortSignal;
}): Promise<ToolResult> {
  if (params.signal?.aborted) return abortedResult();

  if (
    typeof params.x !== "number" ||
    typeof params.y !== "number" ||
    typeof params.width !== "number" ||
    typeof params.height !== "number"
  ) {
    return {
      content: [{ type: "text", text: "zoom requires x, y, width, height parameters" }],
      details: { status: "failed", action: "zoom" },
    };
  }

  const topLeft = mapToScreen(params.x, params.y);
  const bottomRight = mapToScreen(params.x + params.width, params.y + params.height);
  const region = {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };

  return createZoomResult({
    region,
    displayIndex: params.displayIndex,
    source: "zoom",
    signal: params.signal,
    text: `Zoomed region (${params.x}, ${params.y}) ${params.width}x${params.height}. Coordinates from this image are automatically scaled to match screen points.`,
  });
}

export async function executeZoomCursor(params: {
  width?: number;
  height?: number;
  displayIndex?: number;
  signal?: AbortSignal;
}): Promise<ToolResult> {
  if (params.signal?.aborted) return abortedResult();

  const width = Math.max(50, Math.round(params.width ?? DEFAULT_ZOOM_CURSOR_WIDTH));
  const height = Math.max(50, Math.round(params.height ?? DEFAULT_ZOOM_CURSOR_HEIGHT));
  const cursor = await mousePosition();
  const region = {
    x: Math.round(cursor.x - width / 2),
    y: Math.round(cursor.y - height / 2),
    width,
    height,
  };

  return createZoomResult({
    region,
    displayIndex: params.displayIndex,
    source: "zoom_cursor",
    signal: params.signal,
    text: `Zoomed around cursor at (${cursor.x}, ${cursor.y}) with region ${width}x${height}. Coordinates from this image are automatically scaled to match screen points.`,
  });
}
