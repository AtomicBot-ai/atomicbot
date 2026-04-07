import { describe, expect, it } from "vitest";
import { summarizeOcr } from "./summarize-ocr.js";

describe("summarizeOcr", () => {
  it("formats OCR anchors in reading order", () => {
    const summary = summarizeOcr({
      engine: "vision",
      imageWidth: 600,
      imageHeight: 400,
      lines: [
        {
          text: "Saved Messages",
          confidence: 0.99,
          bbox: { left: 120, top: 200, width: 140, height: 24 },
          center: { x: 190, y: 212 },
        },
        {
          text: "Search",
          confidence: 0.95,
          bbox: { left: 100, top: 40, width: 80, height: 20 },
          center: { x: 140, y: 50 },
        },
      ],
    });

    expect(summary).toEqual({
      text: 'OCR anchors: "Search" at (140, 50); "Saved Messages" at (190, 212). Use these local coordinates from this image.',
      matchesCount: 2,
      engine: "vision",
      anchors: [
        { text: "Search", x: 140, y: 50, confidence: 0.95 },
        { text: "Saved Messages", x: 190, y: 212, confidence: 0.99 },
      ],
    });
  });
});
