import { describe, expect, it } from "vitest";
import { buildOcrLayout } from "./build-ocr-layout.js";

describe("buildOcrLayout", () => {
  it("builds ordered OCR layout elements with prompt hint", () => {
    const layout = buildOcrLayout({
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

    expect(layout).toEqual({
      engine: "vision",
      imageWidth: 600,
      imageHeight: 400,
      readingOrder: "top-to-bottom,left-to-right",
      elements: [
        {
          id: "e1",
          text: "Search",
          confidence: 0.95,
          bbox: { left: 100, top: 40, width: 80, height: 20 },
          center: { x: 140, y: 50 },
        },
        {
          id: "e2",
          text: "Saved Messages",
          confidence: 0.99,
          bbox: { left: 120, top: 200, width: 140, height: 24 },
          center: { x: 190, y: 212 },
        },
      ],
      promptHint:
        'OCR layout: [e1 "Search" center=(140, 50) box=(100, 40, 80x20)] [e2 "Saved Messages" center=(190, 212) box=(120, 200, 140x24)]. Use these local coordinates from this image.',
    });
  });

  it("deduplicates normalized text and caps layout size", () => {
    const layout = buildOcrLayout({
      engine: "vision",
      imageWidth: 800,
      imageHeight: 600,
      lines: [
        {
          text: "  Search  ",
          confidence: 0.99,
          bbox: { left: 10, top: 10, width: 50, height: 20 },
          center: { x: 35, y: 20 },
        },
        {
          text: "Search",
          confidence: 0.98,
          bbox: { left: 20, top: 40, width: 60, height: 20 },
          center: { x: 50, y: 50 },
        },
        {
          text: "One",
          confidence: 0.9,
          bbox: { left: 10, top: 70, width: 40, height: 20 },
          center: { x: 30, y: 80 },
        },
        {
          text: "Two",
          confidence: 0.9,
          bbox: { left: 10, top: 100, width: 40, height: 20 },
          center: { x: 30, y: 110 },
        },
        {
          text: "Three",
          confidence: 0.9,
          bbox: { left: 10, top: 130, width: 50, height: 20 },
          center: { x: 35, y: 140 },
        },
        {
          text: "Four",
          confidence: 0.9,
          bbox: { left: 10, top: 160, width: 40, height: 20 },
          center: { x: 30, y: 170 },
        },
        {
          text: "Five",
          confidence: 0.9,
          bbox: { left: 10, top: 190, width: 40, height: 20 },
          center: { x: 30, y: 200 },
        },
        {
          text: "Six",
          confidence: 0.9,
          bbox: { left: 10, top: 220, width: 40, height: 20 },
          center: { x: 30, y: 230 },
        },
        {
          text: "Seven",
          confidence: 0.9,
          bbox: { left: 10, top: 250, width: 50, height: 20 },
          center: { x: 35, y: 260 },
        },
        {
          text: "Eight",
          confidence: 0.9,
          bbox: { left: 10, top: 280, width: 50, height: 20 },
          center: { x: 35, y: 290 },
        },
      ],
    });

    expect(layout?.elements).toHaveLength(8);
    expect(layout?.elements.map((element) => element.text)).toEqual([
      "Search",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
    ]);
    expect(layout?.promptHint).toContain('[e1 "Search" center=(35, 20) box=(10, 10, 50x20)]');
    expect(layout?.promptHint).not.toContain("Five");
  });
});
