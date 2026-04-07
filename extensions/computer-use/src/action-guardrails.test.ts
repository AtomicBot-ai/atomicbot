import { beforeEach, describe, expect, it } from "vitest";
import { evaluateActionGuardrail } from "./action-guardrails.js";
import {
  recordRecentTextEntry,
  resetVisualContextForTest,
  storeCaptureContext,
} from "./visual-context.js";

describe("computer-use action guardrails", () => {
  beforeEach(() => {
    resetVisualContextForTest();
  });

  it("blocks launcher clicks from full screenshots", () => {
    storeCaptureContext({
      source: "screenshot",
      captureX: 0,
      captureY: 0,
      captureWidth: 1728,
      captureHeight: 1117,
      imageWidth: 1280,
      imageHeight: 800,
      scaledDown: true,
    });

    const result = evaluateActionGuardrail({
      action: "click",
      x: 1007,
      y: 774,
    });

    expect(result?.details).toMatchObject({
      status: "blocked",
      reason: "open_app_preferred",
    });
  });

  it("blocks send-button guessing after typing on full screenshots", () => {
    storeCaptureContext({
      source: "screenshot",
      captureX: 0,
      captureY: 0,
      captureWidth: 1728,
      captureHeight: 1117,
      imageWidth: 1280,
      imageHeight: 800,
      scaledDown: true,
    });
    recordRecentTextEntry({
      action: "type",
      textLength: 13,
    });

    const result = evaluateActionGuardrail({
      action: "click",
      x: 1255,
      y: 739,
    });

    expect(result?.details).toMatchObject({
      status: "blocked",
      reason: "submit_input_preferred",
    });
  });

  it("allows clicks after zoomed screenshots", () => {
    storeCaptureContext({
      source: "zoom",
      captureX: 900,
      captureY: 600,
      captureWidth: 300,
      captureHeight: 200,
      imageWidth: 300,
      imageHeight: 200,
      scaledDown: false,
    });
    recordRecentTextEntry({
      action: "type",
      textLength: 13,
    });

    const result = evaluateActionGuardrail({
      action: "click",
      x: 250,
      y: 120,
    });

    expect(result).toBeNull();
  });
});
