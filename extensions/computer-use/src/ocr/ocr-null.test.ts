import { describe, expect, it } from "vitest";
import { createNullOcrAdapter } from "./ocr-null.js";

describe("createNullOcrAdapter", () => {
  it("returns null OCR results", async () => {
    const adapter = createNullOcrAdapter();

    await expect(
      adapter.recognizeText({
        imagePath: "/tmp/shot.png",
        imageWidth: 100,
        imageHeight: 100,
      }),
    ).resolves.toBeNull();
  });
});
