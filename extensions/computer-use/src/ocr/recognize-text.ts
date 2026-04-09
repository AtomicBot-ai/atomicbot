import type { OcrAdapter, OcrResult, RecognizeTextParams } from "./ocr-adapter.js";
import { createMacOsVisionOcrAdapter } from "./ocr-macos-vision.js";
import { createNullOcrAdapter } from "./ocr-null.js";

let cachedAdapter: OcrAdapter | undefined;

export function createOcrAdapter(platform: NodeJS.Platform = process.platform): OcrAdapter {
  if (platform === "darwin") {
    return createMacOsVisionOcrAdapter();
  }
  return createNullOcrAdapter();
}

function getOcrAdapter(): OcrAdapter {
  if (!cachedAdapter) cachedAdapter = createOcrAdapter();
  return cachedAdapter;
}

export async function recognizeText(params: RecognizeTextParams): Promise<OcrResult | null> {
  try {
    const result = await getOcrAdapter().recognizeText(params);
    return result;
  } catch {
    return null;
  }
}
