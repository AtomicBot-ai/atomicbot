import { describe, test, expect } from "vitest";

import { getModelCompatibility, computeContextLength, type SystemInfo } from "./hardware";
import type { LlamacppModelDef } from "./models";

const baseModel: LlamacppModelDef = {
  id: "qwen-3.5-4b",
  name: "Qwen 3.5 4B",
  filename: "test.gguf",
  huggingFaceUrl: "https://example.com/test.gguf",
  fileSizeGb: 1.5,
  sizeLabel: "1.5 GB",
  description: "Test model",
  maxContextLength: 131_072,
  contextLabel: "128K",
  minRamGb: 8,
  recommendedRamGb: 16,
  icon: "qwen",
};

describe("getModelCompatibility", () => {
  test("returns 'recommended' when RAM exceeds recommendedRamGb", () => {
    const sysInfo: SystemInfo = {
      totalRamGb: 32,
      arch: "arm64",
      platform: "darwin",
      isAppleSilicon: true,
    };
    expect(getModelCompatibility(baseModel, sysInfo)).toBe("recommended");
  });

  test("returns 'recommended' when RAM equals recommendedRamGb", () => {
    const sysInfo: SystemInfo = {
      totalRamGb: 16,
      arch: "arm64",
      platform: "darwin",
      isAppleSilicon: true,
    };
    expect(getModelCompatibility(baseModel, sysInfo)).toBe("recommended");
  });

  test("returns 'possible' when RAM is between minRamGb and recommendedRamGb", () => {
    const sysInfo: SystemInfo = {
      totalRamGb: 10,
      arch: "arm64",
      platform: "darwin",
      isAppleSilicon: true,
    };
    expect(getModelCompatibility(baseModel, sysInfo)).toBe("possible");
  });

  test("returns 'possible' when RAM equals minRamGb", () => {
    const sysInfo: SystemInfo = {
      totalRamGb: 8,
      arch: "arm64",
      platform: "darwin",
      isAppleSilicon: true,
    };
    expect(getModelCompatibility(baseModel, sysInfo)).toBe("possible");
  });

  test("returns 'not-recommended' when RAM is below minRamGb", () => {
    const sysInfo: SystemInfo = {
      totalRamGb: 4,
      arch: "arm64",
      platform: "darwin",
      isAppleSilicon: true,
    };
    expect(getModelCompatibility(baseModel, sysInfo)).toBe("not-recommended");
  });
});

describe("computeContextLength", () => {
  const smallModel: LlamacppModelDef = {
    ...baseModel,
    fileSizeGb: 1.5,
    maxContextLength: 131_072,
  };

  const largeModel: LlamacppModelDef = {
    ...baseModel,
    fileSizeGb: 20,
    maxContextLength: 131_072,
    minRamGb: 24,
    recommendedRamGb: 36,
  };

  test("returns minimum context when RAM is insufficient", () => {
    expect(computeContextLength(4, smallModel)).toBe(2048);
  });

  test("returns minimum context when available RAM is zero", () => {
    // 1.5 GB model + 4 GB OS = 5.5 GB needed, only 5 GB available
    expect(computeContextLength(5, smallModel)).toBe(2048);
  });

  test("scales context with available RAM for small models", () => {
    const ctx = computeContextLength(16, smallModel);
    expect(ctx).toBeGreaterThan(8192);
    expect(ctx).toBeLessThanOrEqual(smallModel.maxContextLength);
  });

  test("caps at model maxContextLength", () => {
    const ctx = computeContextLength(128, smallModel);
    expect(ctx).toBeLessThanOrEqual(smallModel.maxContextLength);
    expect(ctx).toBeGreaterThan(smallModel.maxContextLength - 5000);
  });

  test("gives less context for large models", () => {
    const ctxSmall = computeContextLength(36, smallModel);
    const ctxLarge = computeContextLength(36, largeModel);
    expect(ctxLarge).toBeLessThan(ctxSmall);
  });

  test("context is always a multiple of 5000", () => {
    const ctx = computeContextLength(16, smallModel);
    expect(ctx % 5000).toBe(0);
  });
});
