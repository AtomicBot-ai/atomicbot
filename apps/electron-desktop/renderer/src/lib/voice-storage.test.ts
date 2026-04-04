import { describe, it, expect, beforeEach, vi } from "vitest";
import { getVoiceProvider, setVoiceProvider, getWhisperModel } from "./voice-storage";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
});

describe("getVoiceProvider", () => {
  it('defaults to "openai"', () => {
    expect(getVoiceProvider()).toBe("openai");
  });

  it("reads stored value", () => {
    storage.set("openclaw:voiceProvider", "local");
    expect(getVoiceProvider()).toBe("local");
  });

  it('returns "openai" for invalid stored value', () => {
    storage.set("openclaw:voiceProvider", "invalid");
    expect(getVoiceProvider()).toBe("openai");
  });
});

describe("setVoiceProvider", () => {
  it("writes to localStorage", () => {
    setVoiceProvider("local");
    expect(storage.get("openclaw:voiceProvider")).toBe("local");
  });
});

describe("getWhisperModel", () => {
  it('defaults to "small"', () => {
    expect(getWhisperModel()).toBe("small");
  });

  it("reads stored value", () => {
    storage.set("openclaw:whisperModel", "large");
    expect(getWhisperModel()).toBe("large");
  });
});
