import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  screenshotMock,
  readFileMock,
  unlinkMock,
  mousePositionMock,
  recognizeTextMock,
  summarizeOcrMock,
  buildOcrLayoutMock,
} = vi.hoisted(() => ({
  screenshotMock: vi.fn(),
  readFileMock: vi.fn(),
  unlinkMock: vi.fn(),
  mousePositionMock: vi.fn(),
  recognizeTextMock: vi.fn(),
  summarizeOcrMock: vi.fn(),
  buildOcrLayoutMock: vi.fn(),
}));

vi.mock("./usecomputer-native.js", () => ({
  screenshot: screenshotMock,
  click: vi.fn(),
  typeText: vi.fn(),
  press: vi.fn(),
  scroll: vi.fn(),
  mousePosition: mousePositionMock,
  displayList: vi.fn(),
  mouseMove: vi.fn(),
  drag: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: readFileMock,
    unlink: unlinkMock,
  },
}));

vi.mock("./ocr/index.js", () => ({
  buildOcrLayout: buildOcrLayoutMock,
  recognizeText: recognizeTextMock,
  summarizeOcr: summarizeOcrMock,
}));

import { executeScreenshot } from "./actions.js";
import { clearCoordMap, mapToScreen, storeCoordMap } from "./coord-mapping.js";
import { executeZoom, executeZoomCursor } from "./zoom-actions.js";

describe("computer-use actions", () => {
  beforeEach(() => {
    clearCoordMap();
    screenshotMock.mockReset();
    readFileMock.mockReset();
    unlinkMock.mockReset();
    mousePositionMock.mockReset();
    recognizeTextMock.mockReset();
    summarizeOcrMock.mockReset();
    buildOcrLayoutMock.mockReset();
    unlinkMock.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue(Buffer.from("png"));
    recognizeTextMock.mockResolvedValue(null);
    summarizeOcrMock.mockReturnValue(null);
    buildOcrLayoutMock.mockReturnValue(null);
  });

  it("updates coord mapping after zoom screenshots", async () => {
    storeCoordMap("0,0,1000,500,1000,500");
    screenshotMock.mockResolvedValue({
      path: "/tmp/zoom.png",
      captureX: 100,
      captureY: 200,
      captureWidth: 300,
      captureHeight: 150,
      imageWidth: 300,
      imageHeight: 150,
      coordMap: "100,200,300,150,300,150",
      desktopIndex: 0,
    });

    const result = await executeZoom({
      x: 10,
      y: 20,
      width: 50,
      height: 40,
    });

    expect(screenshotMock).toHaveBeenCalledWith({
      annotate: true,
      display: null,
      path: null,
      region: {
        x: 10,
        y: 20,
        width: 50,
        height: 40,
      },
      window: null,
    });
    expect(mapToScreen(0, 0)).toEqual({ x: 100, y: 200 });
    expect(mapToScreen(299, 149)).toEqual({ x: 399, y: 349 });
    expect(result.content[0]).toEqual({
      type: "text",
      text: "Zoomed region (10, 20) 50x40. Coordinates from this image are automatically scaled to match screen points. This zoomed image includes a grid overlay. Treat it as a fresh local coordinate space where the top-left corner is (0, 0). Choose the next click from this crop's grid, not from the previous screenshot.",
    });
  });

  it("captures a centered zoom around the current cursor", async () => {
    mousePositionMock.mockResolvedValue({ x: 250, y: 300 });
    screenshotMock.mockResolvedValue({
      path: "/tmp/zoom-cursor.png",
      captureX: 50,
      captureY: 150,
      captureWidth: 400,
      captureHeight: 300,
      imageWidth: 400,
      imageHeight: 300,
      coordMap: "50,150,400,300,400,300",
      desktopIndex: 0,
    });

    const result = await executeZoomCursor({});

    expect(screenshotMock).toHaveBeenCalledWith({
      annotate: true,
      display: null,
      path: null,
      region: {
        x: 50,
        y: 150,
        width: 400,
        height: 300,
      },
      window: null,
    });
    expect(mapToScreen(0, 0)).toEqual({ x: 50, y: 150 });
    expect(mapToScreen(399, 299)).toEqual({ x: 449, y: 449 });
    expect(result.content[0]).toEqual({
      type: "text",
      text: "Zoomed around cursor at (250, 300) with region 400x300. Coordinates from this image are automatically scaled to match screen points. This zoomed image includes a grid overlay. Treat it as a fresh local coordinate space where the top-left corner is (0, 0). Choose the next click from this crop's grid, not from the previous screenshot.",
    });
  });

  it("adds OCR anchors to screenshot_full results", async () => {
    screenshotMock.mockResolvedValue({
      path: "/tmp/full.png",
      captureX: 0,
      captureY: 0,
      captureWidth: 1728,
      captureHeight: 1117,
      imageWidth: 1568,
      imageHeight: 1014,
      coordMap: "0,0,1728,1117,1568,1014",
      desktopIndex: 0,
    });
    recognizeTextMock.mockResolvedValue({
      engine: "vision",
      imageWidth: 1568,
      imageHeight: 1014,
      lines: [],
    });
    summarizeOcrMock.mockReturnValue({
      text: 'OCR anchors: "Saved Messages" at (184, 465). Use these local coordinates from this image.',
      matchesCount: 1,
      engine: "vision",
      anchors: [{ text: "Saved Messages", x: 184, y: 465, confidence: 0.99 }],
    });
    buildOcrLayoutMock.mockReturnValue({
      engine: "vision",
      imageWidth: 1568,
      imageHeight: 1014,
      readingOrder: "top-to-bottom,left-to-right",
      elements: [
        {
          id: "e1",
          text: "Saved Messages",
          confidence: 0.99,
          bbox: { left: 110, top: 450, width: 148, height: 30 },
          center: { x: 184, y: 465 },
        },
      ],
      promptHint:
        'OCR layout: [e1 "Saved Messages" center=(184, 465) box=(110, 450, 148x30)]. Use these local coordinates from this image.',
    });

    const result = await executeScreenshot({
      captureSource: "screenshot_full",
      disableDownscale: true,
    });

    expect(recognizeTextMock).toHaveBeenCalledWith({
      imagePath: "/tmp/full.png",
      imageWidth: 1568,
      imageHeight: 1014,
      signal: undefined,
    });
    expect(result.content[0]).toEqual({
      type: "text",
      text: 'Full-resolution screenshot captured (1568x1014) with grid overlay. Coordinates from this image are automatically scaled to match screen points. If you need to launch or switch to an app by name, prefer open_app instead of clicking dock icons from the screenshot. Read x/y from the visible grid intersections and OCR anchors instead of estimating fractions of the screen. OCR anchors: "Saved Messages" at (184, 465). Use these local coordinates from this image. OCR layout: [e1 "Saved Messages" center=(184, 465) box=(110, 450, 148x30)]. Use these local coordinates from this image.',
    });
    expect(result.details).toMatchObject({
      ocrSummary:
        'OCR anchors: "Saved Messages" at (184, 465). Use these local coordinates from this image.',
      ocrMatchesCount: 1,
      ocrEngine: "vision",
      ocrLayout: {
        engine: "vision",
        readingOrder: "top-to-bottom,left-to-right",
      },
    });
  });
});
