import { resolveApiKeyForProvider } from "../../agents/model-auth.js";
import { loadConfig } from "../../config/config.js";
import { transcribeOpenAiCompatibleAudio } from "../../media-understanding/openai-compatible-audio.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { formatForLog } from "../ws-log.js";
import type { GatewayRequestHandlers } from "./types.js";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB (OpenAI limit)
const DEFAULT_TIMEOUT_MS = 60_000;

export const audioTranscribeHandlers: GatewayRequestHandlers = {
  "audio.transcribe": async ({ params, respond }) => {
    const audio = typeof params.audio === "string" ? params.audio : "";
    if (!audio) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "audio.transcribe requires base64-encoded audio"),
      );
      return;
    }

    const mime = typeof params.mime === "string" ? params.mime.trim() : "audio/webm";
    const fileName =
      typeof params.fileName === "string" ? params.fileName.trim() : "recording.webm";
    const language = typeof params.language === "string" ? params.language.trim() : undefined;

    let buffer: Buffer;
    try {
      buffer = Buffer.from(audio, "base64");
    } catch {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "Invalid base64 audio data"),
      );
      return;
    }

    if (buffer.length > MAX_AUDIO_BYTES) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Audio exceeds ${MAX_AUDIO_BYTES} byte limit`),
      );
      return;
    }

    try {
      const cfg = loadConfig();
      const resolved = await resolveApiKeyForProvider({ provider: "openai", cfg });
      if (!resolved.apiKey) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, "No OpenAI API key configured"),
        );
        return;
      }

      const result = await transcribeOpenAiCompatibleAudio({
        buffer,
        fileName,
        mime,
        apiKey: resolved.apiKey,
        language,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        defaultBaseUrl: "https://api.openai.com/v1",
        defaultModel: "gpt-4o-mini-transcribe",
      });

      respond(true, { text: result.text, model: result.model });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },
};
