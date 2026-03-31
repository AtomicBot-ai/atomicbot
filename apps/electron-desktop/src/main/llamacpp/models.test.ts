import * as path from "node:path";
import { describe, test, expect } from "vitest";

import {
  LLAMACPP_MODELS,
  getLlamacppModelDef,
  resolveLlamacppModelPath,
  DEFAULT_LLAMACPP_MODEL_ID,
} from "./models";

describe("LLAMACPP_MODELS catalog", () => {
  test("has at least one model", () => {
    expect(LLAMACPP_MODELS.length).toBeGreaterThan(0);
  });

  test("all models have unique ids", () => {
    const ids = LLAMACPP_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("all models have required fields", () => {
    for (const model of LLAMACPP_MODELS) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(model.filename).toBeTruthy();
      expect(model.huggingFaceUrl).toMatch(/^https:\/\//);
      expect(model.minRamGb).toBeGreaterThan(0);
      expect(model.recommendedRamGb).toBeGreaterThanOrEqual(model.minRamGb);
      expect(model.maxContextLength).toBeGreaterThan(0);
      expect(model.fileSizeGb).toBeGreaterThan(0);
    }
  });
});

describe("getLlamacppModelDef", () => {
  test("returns the model for a known id", () => {
    const model = getLlamacppModelDef("qwen-3.5-4b");
    expect(model.id).toBe("qwen-3.5-4b");
    expect(model.name).toBe("Qwen 3.5 4B GGUF");
  });

  test("returns first model for an unknown id", () => {
    // Casting to bypass type safety for test purposes
    const model = getLlamacppModelDef("nonexistent" as never);
    expect(model.id).toBe(LLAMACPP_MODELS[0]!.id);
  });
});

describe("DEFAULT_LLAMACPP_MODEL_ID", () => {
  test("exists in the model catalog", () => {
    const model = LLAMACPP_MODELS.find((m) => m.id === DEFAULT_LLAMACPP_MODEL_ID);
    expect(model).toBeDefined();
  });
});

describe("resolveLlamacppModelPath", () => {
  test("returns path under dataDir/models/<id>/", () => {
    const model = getLlamacppModelDef("qwen-3.5-4b");
    const result = resolveLlamacppModelPath("/tmp/llamacpp", model);
    expect(result).toBe(path.join("/tmp/llamacpp", "models", model.id, model.filename));
  });
});
