import type { OcrResult } from "./ocr-adapter.js";
import { selectOcrLines } from "./select-ocr-lines.js";

export type OcrSummary = {
  text: string;
  matchesCount: number;
  engine: string;
  anchors: Array<{
    text: string;
    x: number;
    y: number;
    confidence: number;
  }>;
};

const MAX_ANCHORS = 6;

export function summarizeOcr(result: OcrResult | null): OcrSummary | null {
  const anchors = selectOcrLines(result, MAX_ANCHORS).map((line) => ({
    text: line.text,
    x: Math.round(line.center.x),
    y: Math.round(line.center.y),
    confidence: line.confidence,
  }));

  if (anchors.length === 0 || !result) {
    return null;
  }

  const anchorsText = anchors
    .map((anchor) => `"${anchor.text}" at (${anchor.x}, ${anchor.y})`)
    .join("; ");
  return {
    text: `OCR anchors: ${anchorsText}. Use these local coordinates from this image.`,
    matchesCount: result.lines.length,
    engine: result.engine,
    anchors,
  };
}
