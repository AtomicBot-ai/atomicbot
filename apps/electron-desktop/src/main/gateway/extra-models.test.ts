import { describe, expect, it } from "vitest";

import { getExtraModels } from "./extra-models";

describe("getExtraModels", () => {
  it("returns a non-empty array", () => {
    const models = getExtraModels();
    expect(models.length).toBeGreaterThan(0);
  });

  it("every entry has required fields", () => {
    for (const m of getExtraModels()) {
      expect(typeof m.id).toBe("string");
      expect(m.id.length).toBeGreaterThan(0);
      expect(typeof m.name).toBe("string");
      expect(m.name.length).toBeGreaterThan(0);
      expect(typeof m.provider).toBe("string");
      expect(m.provider.length).toBeGreaterThan(0);
    }
  });

  it("contains the zai/glm-5-turbo entry", () => {
    const models = getExtraModels();
    const turbo = models.find((m) => m.provider === "zai" && m.id === "glm-5-turbo");
    expect(turbo).toBeDefined();
    expect(turbo!.name).toBe("GLM-5-Turbo");
    expect(turbo!.reasoning).toBe(true);
    expect(turbo!.contextWindow).toBe(200_000);
  });

  it("returns a stable reference (IPC serialization handles copying)", () => {
    const a = getExtraModels();
    const b = getExtraModels();
    expect(a).toBe(b);
  });
});
