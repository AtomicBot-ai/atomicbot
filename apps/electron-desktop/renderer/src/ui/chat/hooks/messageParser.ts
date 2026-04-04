/**
 * Utilities for parsing and sanitizing user messages received via the
 * gateway IPC bridge. Extracted from ChatPage.tsx and Sidebar.tsx so
 * both components (and tests) can share the same logic.
 */
export { stripMetadata } from "@lib/message-strip";
import { stripMetadata } from "@lib/message-strip";

/** Parsed file attachment from user message text. */
export type ParsedFileAttachment = { fileName: string; mimeType: string };

/**
 * Parse user message text that may contain media attachment markers.
 * Supports both core format: [media attached: path (mime)]
 * and legacy format: [Attached: name (mime)]
 * Returns display text (stripped of markers) and parsed file attachments.
 */
export function parseUserMessageWithAttachments(text: string): {
  displayText: string;
  fileAttachments: ParsedFileAttachment[];
} {
  const fileAttachments: ParsedFileAttachment[] = [];
  // Match both: [media attached: path (mime)] and [media attached N/M: path (mime)]
  // Also match the count-only line: [media attached: N files]
  const markerRe = /\[(?:media attached(?:\s+\d+\/\d+)?|Attached):\s*([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = markerRe.exec(text)) !== null) {
    const part = match[1].trim();
    // Skip count-only markers like "[media attached: 2 files]"
    if (/^\d+\s+files?$/.test(part)) {
      continue;
    }
    const lastParen = part.lastIndexOf("(");
    if (lastParen > 0 && part.endsWith(")")) {
      const rawName = part.slice(0, lastParen).trim();
      const mimeType = part.slice(lastParen + 1, -1).trim();
      // Extract just the filename from path (may be full or relative path)
      const fileName = rawName.includes("/") ? rawName.split("/").pop()! : rawName;
      if (fileName && mimeType) {
        fileAttachments.push({ fileName, mimeType });
      }
    }
  }

  const displayText = stripMetadata(text).trim();
  return { displayText, fileAttachments };
}

/**
 * Sanitize raw derivedTitle: strip inbound-meta untrusted context blocks,
 * envelope date headers, attachment markers, media hints, file tags,
 * and message_id hints to recover the original user text for display.
 */
export function cleanDerivedTitle(derivedTitle: string | undefined): string {
  const raw = derivedTitle?.trim();
  if (!raw) {
    return "";
  }
  return stripMetadata(raw).replace(/\s+/g, " ").trim();
}
