/**
 * Pure regex-based metadata stripping for gateway messages.
 * Extracted from ui/chat/hooks/messageParser.ts so the store layer
 * (chat-utils) can use it without importing UI code.
 */

const SYSTEM_EVENT_RE = /^System:\s*\[[^\]]*\][\s\S]*?\n\s*\n/;
const UNTRUSTED_META_RE =
  /^(?:[^\n]*\(untrusted(?:\s+metadata|,\s+for context)\):\n```json\n[\s\S]*?\n```\s*)+(?:\[(?:[A-Za-z]{3}\s+)?\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}[^\]]*\]\s*)?/;
const DATE_HEADER_RE = /^\[(?:[A-Za-z]{3}\s+)?\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}[^\]]*\]\s*/;
const MEDIA_MARKER_RE = /\[media attached(?:\s+\d+\/\d+)?:\s*[^\]]+\]/g;
const LEGACY_MARKER_RE = /\[Attached:\s*[^\]]+\]/g;
const MEDIA_REPLY_HINT_RE =
  /To send an image back, prefer the message tool \(media\/path\/filePath\)\. If you must inline, use MEDIA:https:\/\/example\.com\/image\.jpg \(spaces ok, quote if needed\) or a safe relative path like MEDIA:\.\/image\.jpg\. Avoid absolute paths \(MEDIA:\/\.\.\.\) and ~ paths — they are blocked for security\. Keep caption in the text body\./g;
const FILE_TAG_RE = /<file\b[^>]*>[\s\S]*?(<\/file>|$)/g;
const MESSAGE_ID_RE = /^\s*\[message_id:\s*[^\]]+\]\s*$/gm;
const THINK_BLOCK_RE = /<think>[\s\S]*?(?:<\/think>|$)/g;

/**
 * Strip all gateway-injected metadata from a raw message string:
 * inbound-meta untrusted context, date headers, attachment markers,
 * media-reply hint, file tags, and message_id hints.
 */
export function stripMetadata(text: string): string {
  return text
    .replace(THINK_BLOCK_RE, "")
    .replace(SYSTEM_EVENT_RE, "")
    .replace(UNTRUSTED_META_RE, "")
    .replace(DATE_HEADER_RE, "")
    .replace(MEDIA_MARKER_RE, "")
    .replace(LEGACY_MARKER_RE, "")
    .replace(MEDIA_REPLY_HINT_RE, "")
    .replace(FILE_TAG_RE, "")
    .replace(MESSAGE_ID_RE, "");
}
