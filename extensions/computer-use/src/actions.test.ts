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
import { clearCoordMap } from "./coord-mapping.js";

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
