import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type {
  OcrAdapter,
  OcrAnchorPoint,
  OcrBoundingBox,
  OcrLine,
  OcrResult,
  RecognizeTextParams,
} from "./ocr-adapter.js";

const execFileAsync = promisify(execFile);
const ocrScriptPath = fileURLToPath(
  new URL("../../native/windows/vision-ocr.ps1", import.meta.url),
);

type RawOcrLine = {
  text: unknown;
  confidence: unknown;
  bbox: unknown;
  center: unknown;
};

type RawOcrResponse = {
  engine: unknown;
  imageWidth: unknown;
  imageHeight: unknown;
  lines: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function coercePoint(value: unknown): OcrAnchorPoint | null {
  if (!isRecord(value) || typeof value.x !== "number" || typeof value.y !== "number") {
    return null;
  }
  return { x: value.x, y: value.y };
}

function coerceBoundingBox(value: unknown): OcrBoundingBox | null {
  if (
    !isRecord(value) ||
    typeof value.left !== "number" ||
    typeof value.top !== "number" ||
    typeof value.width !== "number" ||
    typeof value.height !== "number"
  ) {
    return null;
  }
  return {
    left: value.left,
    top: value.top,
    width: value.width,
    height: value.height,
  };
}

function coerceLine(value: unknown): OcrLine | null {
  const rawLine = value as RawOcrLine;
  if (!rawLine || typeof rawLine.text !== "string" || typeof rawLine.confidence !== "number") {
    return null;
  }
  const bbox = coerceBoundingBox(rawLine.bbox);
  const center = coercePoint(rawLine.center);
  if (!bbox || !center) {
    return null;
  }
  return {
    text: rawLine.text.trim(),
    confidence: rawLine.confidence,
    bbox,
    center,
  };
}

function coerceResponse(value: unknown): OcrResult | null {
  const raw = value as RawOcrResponse;
  if (
    !raw ||
    typeof raw.engine !== "string" ||
    typeof raw.imageWidth !== "number" ||
    typeof raw.imageHeight !== "number" ||
    !Array.isArray(raw.lines)
  ) {
    return null;
  }

  const lines = raw.lines
    .map((line) => coerceLine(line))
    .filter((line): line is OcrLine => line !== null && line.text.length > 0);

  return {
    engine: raw.engine,
    imageWidth: raw.imageWidth,
    imageHeight: raw.imageHeight,
    lines,
  };
}

export function createWindowsMediaOcrAdapter(): OcrAdapter {
  return {
    async recognizeText(params: RecognizeTextParams): Promise<OcrResult | null> {
      if (params.signal?.aborted) {
        return null;
      }

      const { stdout } = await execFileAsync(
        "powershell.exe",
        ["-ExecutionPolicy", "Bypass", "-NoProfile", "-File", ocrScriptPath, params.imagePath],
        {
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      const parsed = JSON.parse(stdout) as unknown;
      return coerceResponse(parsed);
    },
  };
}
