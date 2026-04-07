import type { OcrBoundingBox, OcrResult } from "./ocr-adapter.js";
import { selectOcrLines } from "./select-ocr-lines.js";

export type OcrLayoutElement = {
  id: string;
  text: string;
  confidence: number;
  bbox: OcrBoundingBox;
  center: {
    x: number;
    y: number;
  };
};

export type OcrLayout = {
  engine: string;
  imageWidth: number;
  imageHeight: number;
  readingOrder: "top-to-bottom,left-to-right";
  elements: OcrLayoutElement[];
  promptHint: string;
};

const MAX_LAYOUT_ELEMENTS = 8;
const MAX_PROMPT_ELEMENTS = 4;

function formatPromptElement(element: OcrLayoutElement): string {
  const centerX = Math.round(element.center.x);
  const centerY = Math.round(element.center.y);
  const left = Math.round(element.bbox.left);
  const top = Math.round(element.bbox.top);
  const width = Math.round(element.bbox.width);
  const height = Math.round(element.bbox.height);

  return `[${element.id} "${element.text}" center=(${centerX}, ${centerY}) box=(${left}, ${top}, ${width}x${height})]`;
}

export function buildOcrLayout(result: OcrResult | null): OcrLayout | null {
  if (!result) {
    return null;
  }

  const elements = selectOcrLines(result, MAX_LAYOUT_ELEMENTS).map((line, index) => ({
    id: `e${index + 1}`,
    text: line.text,
    confidence: line.confidence,
    bbox: line.bbox,
    center: {
      x: Math.round(line.center.x),
      y: Math.round(line.center.y),
    },
  }));

  if (elements.length === 0) {
    return null;
  }

  const promptElements = elements.slice(0, MAX_PROMPT_ELEMENTS).map(formatPromptElement).join(" ");

  return {
    engine: result.engine,
    imageWidth: result.imageWidth,
    imageHeight: result.imageHeight,
    readingOrder: "top-to-bottom,left-to-right",
    elements,
    promptHint: `OCR layout: ${promptElements}. Use these local coordinates from this image.`,
  };
}
