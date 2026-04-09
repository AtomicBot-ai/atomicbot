import { describe, expect, it, vi } from "vitest";
import type { OcrResult } from "./ocr-adapter.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: (fn: unknown) => fn,
}));

const SAMPLE_RESPONSE: OcrResult = {
  engine: "windows-media-ocr",
  imageWidth: 1920,
  imageHeight: 1080,
  lines: [
    {
      text: "Hello World",
      confidence: 1.0,
      bbox: { left: 100, top: 50, width: 200, height: 20 },
      center: { x: 200, y: 60 },
    },
    {
      text: "Open File",
      confidence: 1.0,
      bbox: { left: 10, top: 100, width: 80, height: 18 },
      center: { x: 50, y: 109 },
    },
  ],
};

describe("createWindowsMediaOcrAdapter", () => {
  it("parses valid powershell JSON output", async () => {
    const { execFile } = await import("node:child_process");
    const mockedExecFile = vi.mocked(execFile);
    mockedExecFile.mockResolvedValue({
      stdout: JSON.stringify(SAMPLE_RESPONSE),
      stderr: "",
    } as never);

    const { createWindowsMediaOcrAdapter } = await import("./ocr-windows-media.js");
    const adapter = createWindowsMediaOcrAdapter();

    const result = await adapter.recognizeText({
      imagePath: "C:\\tmp\\shot.png",
      imageWidth: 1920,
      imageHeight: 1080,
    });

    expect(result).not.toBeNull();
    expect(result!.engine).toBe("windows-media-ocr");
    expect(result!.imageWidth).toBe(1920);
    expect(result!.imageHeight).toBe(1080);
    expect(result!.lines).toHaveLength(2);
    expect(result!.lines[0].text).toBe("Hello World");
    expect(result!.lines[0].center).toEqual({ x: 200, y: 60 });
  });

  it("returns null when signal is already aborted", async () => {
    const { createWindowsMediaOcrAdapter } = await import("./ocr-windows-media.js");
    const adapter = createWindowsMediaOcrAdapter();
    const controller = new AbortController();
    controller.abort();

    const result = await adapter.recognizeText({
      imagePath: "C:\\tmp\\shot.png",
      imageWidth: 1920,
      imageHeight: 1080,
      signal: controller.signal,
    });

    expect(result).toBeNull();
  });

  it("returns null for malformed JSON", async () => {
    const { execFile } = await import("node:child_process");
    const mockedExecFile = vi.mocked(execFile);
    mockedExecFile.mockResolvedValue({
      stdout: "not json",
      stderr: "",
    } as never);

    const { createWindowsMediaOcrAdapter } = await import("./ocr-windows-media.js");
    const adapter = createWindowsMediaOcrAdapter();

    await expect(
      adapter.recognizeText({
        imagePath: "C:\\tmp\\shot.png",
        imageWidth: 1920,
        imageHeight: 1080,
      }),
    ).rejects.toThrow();
  });

  it("filters out empty text lines", async () => {
    const { execFile } = await import("node:child_process");
    const mockedExecFile = vi.mocked(execFile);

    const responseWithEmpty = {
      ...SAMPLE_RESPONSE,
      lines: [
        ...SAMPLE_RESPONSE.lines,
        {
          text: "",
          confidence: 1.0,
          bbox: { left: 0, top: 0, width: 10, height: 10 },
          center: { x: 5, y: 5 },
        },
      ],
    };

    mockedExecFile.mockResolvedValue({
      stdout: JSON.stringify(responseWithEmpty),
      stderr: "",
    } as never);

    const { createWindowsMediaOcrAdapter } = await import("./ocr-windows-media.js");
    const adapter = createWindowsMediaOcrAdapter();

    const result = await adapter.recognizeText({
      imagePath: "C:\\tmp\\shot.png",
      imageWidth: 1920,
      imageHeight: 1080,
    });

    expect(result!.lines).toHaveLength(2);
  });

  it("invokes powershell with correct arguments", async () => {
    const { execFile } = await import("node:child_process");
    const mockedExecFile = vi.mocked(execFile);
    mockedExecFile.mockResolvedValue({
      stdout: JSON.stringify(SAMPLE_RESPONSE),
      stderr: "",
    } as never);

    const { createWindowsMediaOcrAdapter } = await import("./ocr-windows-media.js");
    const adapter = createWindowsMediaOcrAdapter();

    await adapter.recognizeText({
      imagePath: "C:\\Users\\test\\shot.png",
      imageWidth: 1920,
      imageHeight: 1080,
    });

    expect(mockedExecFile).toHaveBeenCalledWith(
      "powershell.exe",
      expect.arrayContaining([
        "-ExecutionPolicy",
        "Bypass",
        "-NoProfile",
        "-File",
        expect.stringContaining("vision-ocr.ps1"),
        "C:\\Users\\test\\shot.png",
      ]),
      expect.objectContaining({ maxBuffer: 10 * 1024 * 1024 }),
    );
  });
});
