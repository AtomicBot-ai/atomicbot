/**
 * Convert a markdown string into a single-line plain-text preview
 * suitable for OS-level notifications (macOS / Windows).
 *
 * Handles the most common markdown constructs: fenced and inline code,
 * bold / italic / strikethrough emphasis, headings, blockquotes,
 * lists, links, images, horizontal rules, and inline HTML tags.
 *
 * The result is intentionally lossy — it aims to produce something a
 * human can read in a small tooltip-like surface, not a round-trippable
 * representation of the source.
 */

const FENCED_CODE_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`([^`]+)`/g;
const IMAGE_RE = /!\[([^\]]*)\]\([^)]*\)/g;
const LINK_RE = /\[([^\]]+)\]\(([^)]*)\)/g;
const AUTO_LINK_RE = /<((?:https?|mailto):[^>]+)>/g;
const REFERENCE_LINK_RE = /\[([^\]]+)\]\[[^\]]*\]/g;
const REFERENCE_DEF_RE = /^\s*\[[^\]]+\]:\s*\S+.*$/gm;
const HEADING_RE = /^\s{0,3}#{1,6}\s+/gm;
const BLOCKQUOTE_RE = /^\s{0,3}>\s?/gm;
const LIST_MARKER_RE = /^\s*(?:[-*+]|\d+[.)])\s+/gm;
const HORIZONTAL_RULE_RE = /^\s*(?:[-*_]\s*){3,}\s*$/gm;
const BOLD_RE = /(\*\*|__)(.+?)\1/g;
const ITALIC_STAR_RE = /(?<![*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g;
const ITALIC_UNDERSCORE_RE = /(?<![_\w])_(?!\s)([^_\n]+?)_(?!\w)/g;
const STRIKETHROUGH_RE = /~~([^~]+)~~/g;
const HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/g;
const TABLE_SEPARATOR_RE = /^\s*\|?\s*(?::?-{3,}:?\s*\|?\s*)+\s*$/gm;

/**
 * Strip markdown formatting from `input` and collapse whitespace
 * into a single line. Returns an empty string for nullish / blank input.
 */
export function markdownToPlainText(input: string | null | undefined): string {
  if (!input) {
    return "";
  }
  let out = input;

  out = out.replace(FENCED_CODE_RE, (match) => {
    const inner = match.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, "");
    return inner;
  });

  out = out.replace(IMAGE_RE, (_, alt: string) => alt);
  out = out.replace(LINK_RE, (_, text: string) => text);
  out = out.replace(REFERENCE_LINK_RE, (_, text: string) => text);
  out = out.replace(AUTO_LINK_RE, (_, url: string) => url);
  out = out.replace(REFERENCE_DEF_RE, "");

  out = out.replace(HORIZONTAL_RULE_RE, "");
  out = out.replace(TABLE_SEPARATOR_RE, "");
  out = out.replace(HEADING_RE, "");
  out = out.replace(BLOCKQUOTE_RE, "");
  out = out.replace(LIST_MARKER_RE, "");

  out = out.replace(BOLD_RE, (_, __, text: string) => text);
  out = out.replace(STRIKETHROUGH_RE, (_, text: string) => text);
  out = out.replace(ITALIC_STAR_RE, (_, text: string) => text);
  out = out.replace(ITALIC_UNDERSCORE_RE, (_, text: string) => text);
  out = out.replace(INLINE_CODE_RE, (_, text: string) => text);

  out = out.replace(HTML_TAG_RE, "");

  out = out.replace(/\|/g, " ");

  out = out.replace(/\\([*_`~#>\-+|\\[\]()!])/g, "$1");

  out = out.replace(/\s+/g, " ").trim();

  return out;
}
