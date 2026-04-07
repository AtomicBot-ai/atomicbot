import type { OcrAnchorPoint, OcrBoundingBox, OcrLine, OcrResult } from "./ocr-adapter.js";

export type SelectedOcrLine = {
  text: string;
  confidence: number;
  bbox: OcrBoundingBox;
  center: OcrAnchorPoint;
};

function normalizeOcrText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function compareReadingOrder(left: OcrLine, right: OcrLine): number {
  const verticalDelta = Math.abs(left.bbox.top - right.bbox.top);
  if (verticalDelta <= 8) {
    return left.bbox.left - right.bbox.left;
  }
  return left.bbox.top - right.bbox.top;
}

export function selectOcrLines(result: OcrResult | null, maxItems: number): SelectedOcrLine[] {
  if (!result || result.lines.length === 0 || maxItems <= 0) {
    return [];
  }

  const seen = new Set<string>();

  return result.lines
    .map((line) => ({
      text: normalizeOcrText(line.text),
      confidence: line.confidence,
      bbox: line.bbox,
      center: line.center,
    }))
    .filter((line) => line.text.length >= 2)
    .sort((left, right) =>
      compareReadingOrder(
        {
          text: left.text,
          confidence: left.confidence,
          bbox: left.bbox,
          center: left.center,
        },
        {
          text: right.text,
          confidence: right.confidence,
          bbox: right.bbox,
          center: right.center,
        },
      ),
    )
    .filter((line) => {
      const key = line.text.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, maxItems);
}
