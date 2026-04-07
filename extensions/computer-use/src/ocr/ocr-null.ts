import type { OcrAdapter } from "./ocr-adapter.js";

export function createNullOcrAdapter(): OcrAdapter {
  return {
    async recognizeText() {
      return null;
    },
  };
}
