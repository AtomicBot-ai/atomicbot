import { describe, expect, it } from "vitest";

import { resolveModelSelectBackTarget } from "./resolve-model-select-back-target";

describe("resolveModelSelectBackTarget", () => {
  it("returns Ollama setup for Ollama provider", () => {
    expect(resolveModelSelectBackTarget("ollama")).toBe("ollama-setup");
  });

  it("returns API key for non-Ollama providers", () => {
    expect(resolveModelSelectBackTarget("openai")).toBe("api-key");
  });

  it("returns API key when provider is not selected", () => {
    expect(resolveModelSelectBackTarget(null)).toBe("api-key");
  });
});
