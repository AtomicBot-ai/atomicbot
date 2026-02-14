/**
 * Tests for parseUserMessageWithAttachments and cleanDerivedTitle.
 * These functions sanitize user messages by stripping attachment markers, inbound-meta
 * blocks, file tags, and other gateway-injected metadata.
 */
import { describe, expect, it } from "vitest";

import { parseUserMessageWithAttachments, cleanDerivedTitle } from "./messageParser";

// ── parseUserMessageWithAttachments ────────────────────────────────────────────

describe("parseUserMessageWithAttachments", () => {
  it("returns plain text as-is with no attachments", () => {
    const result = parseUserMessageWithAttachments("hello world");
    expect(result.displayText).toBe("hello world");
    expect(result.fileAttachments).toEqual([]);
  });

  it("extracts core format attachment [media attached: path (mime)]", () => {
    const text = "Check this out [media attached: /path/to/photo.jpg (image/jpeg)]";
    const result = parseUserMessageWithAttachments(text);
    expect(result.fileAttachments).toHaveLength(1);
    expect(result.fileAttachments[0]).toEqual({
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
    });
    expect(result.displayText).not.toContain("[media attached:");
  });

  it("extracts legacy format attachment [Attached: name (mime)]", () => {
    const text = "See attached [Attached: document.pdf (application/pdf)]";
    const result = parseUserMessageWithAttachments(text);
    expect(result.fileAttachments).toHaveLength(1);
    expect(result.fileAttachments[0]).toEqual({
      fileName: "document.pdf",
      mimeType: "application/pdf",
    });
    expect(result.displayText).not.toContain("[Attached:");
  });

  it("extracts multiple attachments", () => {
    const text =
      "Files [media attached: /a/b.png (image/png)] and [media attached: /c/d.mp3 (audio/mpeg)]";
    const result = parseUserMessageWithAttachments(text);
    expect(result.fileAttachments).toHaveLength(2);
    expect(result.fileAttachments[0].fileName).toBe("b.png");
    expect(result.fileAttachments[1].fileName).toBe("d.mp3");
  });

  it("skips count-only markers like [media attached: 2 files]", () => {
    const text = "Here are some files [media attached: 2 files]";
    const result = parseUserMessageWithAttachments(text);
    expect(result.fileAttachments).toEqual([]);
  });

  it("handles numbered format [media attached 1/2: ...]", () => {
    const text = "[media attached 1/2: /a/b.png (image/png)]";
    const result = parseUserMessageWithAttachments(text);
    expect(result.fileAttachments).toHaveLength(1);
    expect(result.fileAttachments[0].fileName).toBe("b.png");
  });

  it("strips file tags from display text", () => {
    const text = 'text <file path="/a/b.txt">content</file> more text';
    const result = parseUserMessageWithAttachments(text);
    expect(result.displayText).not.toContain("<file");
    expect(result.displayText).not.toContain("</file>");
  });

  it("strips message_id hints from display text", () => {
    const text = "[message_id: abc-123]\nHello there";
    const result = parseUserMessageWithAttachments(text);
    expect(result.displayText).not.toContain("[message_id:");
    expect(result.displayText).toContain("Hello there");
  });

  it("strips media-reply hint from display text", () => {
    const text =
      "To send an image back, prefer the message tool (media/path/filePath). If you must inline, use MEDIA:https://example.com/image.jpg (spaces ok, quote if needed) or a safe relative path like MEDIA:./image.jpg. Avoid absolute paths (MEDIA:/...) and ~ paths — they are blocked for security. Keep caption in the text body.\nActual message";
    const result = parseUserMessageWithAttachments(text);
    expect(result.displayText).toBe("Actual message");
  });

  it("returns empty display text when only markers present", () => {
    const text = "[media attached: /a/b.png (image/png)]";
    const result = parseUserMessageWithAttachments(text);
    expect(result.displayText).toBe("");
    expect(result.fileAttachments).toHaveLength(1);
  });
});

// ── cleanDerivedTitle ──────────────────────────────────────────────────────────

describe("cleanDerivedTitle", () => {
  it("returns empty for undefined", () => {
    expect(cleanDerivedTitle(undefined)).toBe("");
  });

  it("returns empty for empty string", () => {
    expect(cleanDerivedTitle("")).toBe("");
    expect(cleanDerivedTitle("   ")).toBe("");
  });

  it("returns plain text as-is", () => {
    expect(cleanDerivedTitle("My Chat Title")).toBe("My Chat Title");
  });

  it("strips media attachment markers", () => {
    const title = "Hello [media attached: /a/b.png (image/png)] world";
    expect(cleanDerivedTitle(title)).toBe("Hello world");
  });

  it("strips legacy attachment markers", () => {
    const title = "Check [Attached: doc.pdf (application/pdf)] this";
    expect(cleanDerivedTitle(title)).toBe("Check this");
  });

  it("strips file tags", () => {
    const title = 'text <file path="/a">content</file> more';
    const result = cleanDerivedTitle(title);
    expect(result).not.toContain("<file");
  });

  it("strips message_id hints", () => {
    const title = "[message_id: abc-123]\nHello";
    const result = cleanDerivedTitle(title);
    expect(result).not.toContain("[message_id:");
    expect(result).toContain("Hello");
  });

  it("collapses whitespace", () => {
    const title = "Hello   \n   world";
    expect(cleanDerivedTitle(title)).toBe("Hello world");
  });

  it("strips inbound-meta untrusted context blocks", () => {
    const title =
      'Sender info (untrusted metadata):\n```json\n{"from":"user"}\n```\nActual message';
    const result = cleanDerivedTitle(title);
    expect(result).toContain("Actual message");
    expect(result).not.toContain("untrusted");
  });

  it("strips envelope date headers", () => {
    const title = "[2025-01-15 14:30 UTC] My actual title";
    const result = cleanDerivedTitle(title);
    expect(result).toBe("My actual title");
  });
});
