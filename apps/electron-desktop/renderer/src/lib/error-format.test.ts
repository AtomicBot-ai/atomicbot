import { describe, it, expect } from "vitest";
import { errorToMessage } from "./error-format";

describe("errorToMessage", () => {
  it("returns string errors verbatim", () => {
    expect(errorToMessage("boom")).toBe("boom");
  });

  it("extracts Error.message", () => {
    expect(errorToMessage(new Error("fail"))).toBe("fail");
  });

  it('falls back to "Unknown error" for empty Error.message', () => {
    expect(errorToMessage(new Error(""))).toBe("Unknown error");
  });

  it("extracts message from plain objects", () => {
    expect(errorToMessage({ message: "obj err" })).toBe("obj err");
  });

  it('returns "Unknown error" for empty object message', () => {
    expect(errorToMessage({ message: "" })).toBe("Unknown error");
  });

  it("JSON-serializes non-message objects", () => {
    expect(errorToMessage({ code: 42 })).toBe('{"code":42}');
  });

  it('returns "Unknown error" for empty objects', () => {
    expect(errorToMessage({})).toBe("Unknown error");
  });

  it('returns "Unknown error" for empty arrays', () => {
    expect(errorToMessage([])).toBe("Unknown error");
  });

  it("uses String() as last resort", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(errorToMessage(circular)).toBe("[object Object]");
  });

  it("handles null", () => {
    expect(errorToMessage(null)).toBe("null");
  });

  it("handles undefined", () => {
    expect(errorToMessage(undefined)).toBe("Unknown error");
  });

  it("handles numbers", () => {
    expect(errorToMessage(404)).toBe("404");
  });
});
