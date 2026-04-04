/**
 * Tests for welcome/utils.ts helpers.
 */
import { describe, expect, it } from "vitest";

import { getObject, getStringArray, inferWorkspaceDirFromConfigPath, unique } from "./onboarding-config-helpers";

// ── getObject ──────────────────────────────────────────────────────────────────

describe("getObject", () => {
  it("returns the object when given a plain object", () => {
    const obj = { key: "value" };
    expect(getObject(obj)).toBe(obj);
  });

  it("returns empty object for null", () => {
    expect(getObject(null)).toEqual({});
  });

  it("returns empty object for undefined", () => {
    expect(getObject(undefined)).toEqual({});
  });

  it("returns empty object for arrays", () => {
    expect(getObject([1, 2, 3])).toEqual({});
  });

  it("returns empty object for strings", () => {
    expect(getObject("hello")).toEqual({});
  });

  it("returns empty object for numbers", () => {
    expect(getObject(42)).toEqual({});
  });

  it("returns empty object for booleans", () => {
    expect(getObject(true)).toEqual({});
  });

  it("returns nested objects as-is", () => {
    const obj = { nested: { deep: true } };
    expect(getObject(obj)).toBe(obj);
  });
});

// ── getStringArray ─────────────────────────────────────────────────────────────

describe("getStringArray", () => {
  it("returns strings from array", () => {
    expect(getStringArray(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("converts non-string values to strings", () => {
    expect(getStringArray([1, 2])).toEqual(["1", "2"]);
  });

  it("filters empty trimmed strings", () => {
    expect(getStringArray(["a", "", "  ", "b"])).toEqual(["a", "b"]);
  });

  it("returns empty for non-array", () => {
    expect(getStringArray(null)).toEqual([]);
    expect(getStringArray("string")).toEqual([]);
    expect(getStringArray(42)).toEqual([]);
    expect(getStringArray({})).toEqual([]);
  });

  it("trims whitespace from values", () => {
    expect(getStringArray(["  hello  ", "  world  "])).toEqual(["hello", "world"]);
  });
});

// ── unique ─────────────────────────────────────────────────────────────────────

describe("unique", () => {
  it("removes duplicates", () => {
    expect(unique(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
  });

  it("returns empty for empty array", () => {
    expect(unique([])).toEqual([]);
  });

  it("preserves order of first occurrence", () => {
    expect(unique(["c", "b", "a", "b"])).toEqual(["c", "b", "a"]);
  });
});

// ── inferWorkspaceDirFromConfigPath ────────────────────────────────────────────

describe("inferWorkspaceDirFromConfigPath", () => {
  it("infers workspace dir from config path", () => {
    expect(inferWorkspaceDirFromConfigPath("/home/user/.openclaw/config.yaml")).toBe(
      "/home/user/.openclaw/workspace"
    );
  });

  it("returns fallback for undefined", () => {
    expect(inferWorkspaceDirFromConfigPath(undefined)).toBe("~/openclaw-workspace");
  });

  it("returns fallback for empty string", () => {
    expect(inferWorkspaceDirFromConfigPath("")).toBe("~/openclaw-workspace");
    expect(inferWorkspaceDirFromConfigPath("  ")).toBe("~/openclaw-workspace");
  });

  it("handles Windows paths", () => {
    expect(inferWorkspaceDirFromConfigPath("C:\\Users\\me\\.openclaw\\config.yaml")).toBe(
      "C:\\Users\\me\\.openclaw\\workspace"
    );
  });

  it("returns fallback for path with no separator", () => {
    expect(inferWorkspaceDirFromConfigPath("config.yaml")).toBe("~/openclaw-workspace");
  });
});
