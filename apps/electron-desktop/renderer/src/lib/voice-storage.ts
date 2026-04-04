/**
 * Pure localStorage accessors for voice provider/model selection.
 * Extracted from ui/chat/hooks/useVoiceInput.ts so the store layer
 * (whisperSlice) can use them without importing UI code.
 */

export type VoiceProvider = "openai" | "local";

const STORAGE_KEY = "openclaw:voiceProvider";
const MODEL_STORAGE_KEY = "openclaw:whisperModel";

export function getWhisperModel(): string {
  try {
    return localStorage.getItem(MODEL_STORAGE_KEY) ?? "small";
  } catch {
    return "small";
  }
}

export function getVoiceProvider(): VoiceProvider {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "openai" || v === "local") return v;
  } catch {
    // localStorage unavailable
  }
  return "openai";
}

export function setVoiceProvider(provider: VoiceProvider): void {
  try {
    localStorage.setItem(STORAGE_KEY, provider);
  } catch {
    // localStorage unavailable
  }
}
