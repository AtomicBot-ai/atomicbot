import fs from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_INPUT_FILE_MAX_BYTES,
  DEFAULT_INPUT_FILE_MAX_CHARS,
  DEFAULT_INPUT_FILE_MIMES,
  DEFAULT_INPUT_PDF_MAX_PAGES,
  DEFAULT_INPUT_PDF_MAX_PIXELS,
  DEFAULT_INPUT_PDF_MIN_TEXT_CHARS,
  extractFileContentFromSource,
  normalizeMimeList,
} from "../media/input-files.js";
import { detectMime, extensionForMime } from "../media/mime.js";
import { CHAT_ATTACHMENT_MAX_BYTES } from "./server-constants.js";

export type ChatAttachment = {
  type?: string;
  mimeType?: string;
  fileName?: string;
  content?: unknown;
};

export type ChatImageContent = {
  type: "image";
  data: string;
  mimeType: string;
};

export type ParsedMessageWithImages = {
  message: string;
  images: ChatImageContent[];
};

type AttachmentLog = {
  warn: (message: string) => void;
};

const EXTRACTED_TEXT_MAX_CHARS = 80_000;

/** Safe filename for cross-platform attachment storage (no path sep, limited length). */
function safeAttachmentBasename(label: string, mime?: string): string {
  const base = path
    .basename(String(label))
    .replace(/[/\\\0]/g, "_")
    .slice(0, 80);
  const ext = mime ? (extensionForMime(mime) ?? path.extname(label)) : path.extname(label);
  if (ext && !base.toLowerCase().endsWith(ext.toLowerCase())) {
    return base + (ext.startsWith(".") ? ext : `.${ext}`);
  }
  return base || "attachment";
}

function normalizeMime(mime?: string): string | undefined {
  if (!mime) {
    return undefined;
  }
  const cleaned = mime.split(";")[0]?.trim().toLowerCase();
  return cleaned || undefined;
}

async function sniffMimeFromBase64(base64: string): Promise<string | undefined> {
  const trimmed = base64.trim();
  if (!trimmed) {
    return undefined;
  }

  const take = Math.min(256, trimmed.length);
  const sliceLen = take - (take % 4);
  if (sliceLen < 8) {
    return undefined;
  }

  try {
    const head = Buffer.from(trimmed.slice(0, sliceLen), "base64");
    return await detectMime({ buffer: head });
  } catch {
    return undefined;
  }
}

function isImageMime(mime?: string): boolean {
  return typeof mime === "string" && mime.startsWith("image/");
}

/** Limits for extracting text from PDF/text attachments (optional dependency pdfjs-dist). */
const CHAT_FILE_LIMITS = {
  allowUrl: false,
  allowedMimes: normalizeMimeList(undefined, DEFAULT_INPUT_FILE_MIMES),
  maxBytes: Math.min(DEFAULT_INPUT_FILE_MAX_BYTES, CHAT_ATTACHMENT_MAX_BYTES),
  maxChars: DEFAULT_INPUT_FILE_MAX_CHARS,
  maxRedirects: 0,
  timeoutMs: 0,
  pdf: {
    maxPages: DEFAULT_INPUT_PDF_MAX_PAGES,
    maxPixels: DEFAULT_INPUT_PDF_MAX_PIXELS,
    minTextChars: DEFAULT_INPUT_PDF_MIN_TEXT_CHARS,
  },
};

/**
 * Parse attachments and extract images as structured content blocks.
 * Non-image attachments: saved to saveDir when provided (path added to message),
 * and for PDF/text types extracted text is injected so the agent can process them.
 * Returns the message text (with file refs and optional content for non-images) and image content blocks.
 */
export async function parseMessageWithAttachments(
  message: string,
  attachments: ChatAttachment[] | undefined,
  opts?: { maxBytes?: number; log?: AttachmentLog; saveDir?: string },
): Promise<ParsedMessageWithImages> {
  const maxBytes = opts?.maxBytes ?? CHAT_ATTACHMENT_MAX_BYTES;
  const log = opts?.log;
  const saveDir = opts?.saveDir;
  if (!attachments || attachments.length === 0) {
    return { message, images: [] };
  }

  const images: ChatImageContent[] = [];
  const fileRefs: string[] = [];

  for (const [idx, att] of attachments.entries()) {
    if (!att) {
      continue;
    }
    const mime = att.mimeType ?? "";
    const content = att.content;
    const label = att.fileName || att.type || `attachment-${idx + 1}`;

    if (typeof content !== "string") {
      throw new Error(`attachment ${label}: content must be base64 string`);
    }

    let sizeBytes = 0;
    let b64 = content.trim();
    // Strip data URL prefix if present (e.g., "data:image/jpeg;base64,...")
    const dataUrlMatch = /^data:[^;]+;base64,(.*)$/.exec(b64);
    if (dataUrlMatch) {
      b64 = dataUrlMatch[1];
    }
    // Basic base64 sanity: length multiple of 4 and charset check.
    if (b64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(b64)) {
      throw new Error(`attachment ${label}: invalid base64 content`);
    }
    const buffer = Buffer.from(b64, "base64");
    sizeBytes = buffer.byteLength;
    if (sizeBytes <= 0 || sizeBytes > maxBytes) {
      throw new Error(`attachment ${label}: exceeds size limit (${sizeBytes} > ${maxBytes} bytes)`);
    }

    const providedMime = normalizeMime(mime);
    const sniffedMime = normalizeMime(await sniffMimeFromBase64(b64));
    const effectiveMime = sniffedMime ?? providedMime ?? mime;

    if (sniffedMime && !isImageMime(sniffedMime)) {
      log?.warn(`attachment ${label}: non-image (${sniffedMime}), adding as file reference`);
      const refLines: string[] = [
        `[Attached: ${label} (${effectiveMime || "application/octet-stream"})]`,
      ];
      let savedPath: string | undefined;
      if (saveDir) {
        try {
          const basename = safeAttachmentBasename(label, effectiveMime || undefined);
          const outPath = path.join(saveDir, basename);
          await fs.mkdir(saveDir, { recursive: true, mode: 0o700 });
          await fs.writeFile(outPath, buffer, { mode: 0o600 });
          savedPath = path.resolve(outPath);
          refLines.push(`Path: ${savedPath}`);
        } catch (err) {
          log?.warn(`attachment ${label}: failed to save to disk: ${String(err)}`);
        }
      }
      if (
        effectiveMime &&
        CHAT_FILE_LIMITS.allowedMimes.has(effectiveMime) &&
        sizeBytes <= CHAT_FILE_LIMITS.maxBytes
      ) {
        try {
          const extracted = await extractFileContentFromSource({
            source: {
              type: "base64",
              data: b64,
              mediaType: effectiveMime,
              filename: label,
            },
            limits: CHAT_FILE_LIMITS,
          });
          const text = extracted.text?.trim();
          if (text) {
            const clamped =
              text.length > EXTRACTED_TEXT_MAX_CHARS
                ? `${text.slice(0, EXTRACTED_TEXT_MAX_CHARS)}\n[... truncated]`
                : text;
            refLines.push("--- Content ---", clamped);
          }
        } catch {
          // Optional pdfjs-dist or unsupported mime; keep ref (and path if saved)
        }
      }
      fileRefs.push(refLines.join("\n"));
      continue;
    }
    if (!sniffedMime && !isImageMime(providedMime)) {
      log?.warn(`attachment ${label}: not detected as image, adding as file reference`);
      const refLines: string[] = [
        `[Attached: ${label} (${effectiveMime || "application/octet-stream"})]`,
      ];
      if (saveDir) {
        try {
          const basename = safeAttachmentBasename(label, effectiveMime || undefined);
          const outPath = path.join(saveDir, basename);
          await fs.mkdir(saveDir, { recursive: true, mode: 0o700 });
          await fs.writeFile(outPath, buffer, { mode: 0o600 });
          refLines.push(`Path: ${path.resolve(outPath)}`);
        } catch (err) {
          log?.warn(`attachment ${label}: failed to save to disk: ${String(err)}`);
        }
      }
      if (
        effectiveMime &&
        CHAT_FILE_LIMITS.allowedMimes.has(effectiveMime) &&
        sizeBytes <= CHAT_FILE_LIMITS.maxBytes
      ) {
        try {
          const extracted = await extractFileContentFromSource({
            source: {
              type: "base64",
              data: b64,
              mediaType: effectiveMime,
              filename: label,
            },
            limits: CHAT_FILE_LIMITS,
          });
          const text = extracted.text?.trim();
          if (text) {
            const clamped =
              text.length > EXTRACTED_TEXT_MAX_CHARS
                ? `${text.slice(0, EXTRACTED_TEXT_MAX_CHARS)}\n[... truncated]`
                : text;
            refLines.push("--- Content ---", clamped);
          }
        } catch {
          // keep ref only
        }
      }
      fileRefs.push(refLines.join("\n"));
      continue;
    }
    if (sniffedMime && providedMime && sniffedMime !== providedMime) {
      log?.warn(
        `attachment ${label}: mime mismatch (${providedMime} -> ${sniffedMime}), using sniffed`,
      );
    }

    images.push({
      type: "image",
      data: b64,
      mimeType: effectiveMime ?? mime,
    });
  }

  const outMessage =
    fileRefs.length > 0
      ? `${message.trim() ? `${message.trim()}\n\n` : ""}${fileRefs.join("\n\n")}`
      : message;

  return { message: outMessage, images };
}

/**
 * @deprecated Use parseMessageWithAttachments instead.
 * This function converts images to markdown data URLs which Claude API cannot process as images.
 */
export function buildMessageWithAttachments(
  message: string,
  attachments: ChatAttachment[] | undefined,
  opts?: { maxBytes?: number },
): string {
  const maxBytes = opts?.maxBytes ?? 2_000_000; // 2 MB
  if (!attachments || attachments.length === 0) {
    return message;
  }

  const blocks: string[] = [];

  for (const [idx, att] of attachments.entries()) {
    if (!att) {
      continue;
    }
    const mime = att.mimeType ?? "";
    const content = att.content;
    const label = att.fileName || att.type || `attachment-${idx + 1}`;

    if (typeof content !== "string") {
      throw new Error(`attachment ${label}: content must be base64 string`);
    }
    if (!mime.startsWith("image/")) {
      throw new Error(`attachment ${label}: only image/* supported`);
    }

    let sizeBytes = 0;
    const b64 = content.trim();
    // Basic base64 sanity: length multiple of 4 and charset check.
    if (b64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(b64)) {
      throw new Error(`attachment ${label}: invalid base64 content`);
    }
    try {
      sizeBytes = Buffer.from(b64, "base64").byteLength;
    } catch {
      throw new Error(`attachment ${label}: invalid base64 content`);
    }
    if (sizeBytes <= 0 || sizeBytes > maxBytes) {
      throw new Error(`attachment ${label}: exceeds size limit (${sizeBytes} > ${maxBytes} bytes)`);
    }

    const safeLabel = label.replace(/\s+/g, "_");
    const dataUrl = `![${safeLabel}](data:${mime};base64,${content})`;
    blocks.push(dataUrl);
  }

  if (blocks.length === 0) {
    return message;
  }
  const separator = message.trim().length > 0 ? "\n\n" : "";
  return `${message}${separator}${blocks.join("\n\n")}`;
}
