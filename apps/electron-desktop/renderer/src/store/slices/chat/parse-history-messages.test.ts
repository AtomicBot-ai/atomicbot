/**
 * Tests for chat-utils — pure utility functions extracted from chatSlice.
 * RED phase: these tests import from chat-utils.ts which does not exist yet.
 */
import { describe, expect, it } from "vitest";

import {
  dataUrlToBase64,
  extractAttachmentsFromMessage,
  extractText,
  extractToolCalls,
  isApprovalContinueMessage,
  isHeartbeatMessage,
  parseHistoryMessages,
} from "./parse-history-messages";

// ── dataUrlToBase64 ─────────────────────────────────────────────────────────────

describe("dataUrlToBase64", () => {
  it("parses valid data URL", () => {
    const result = dataUrlToBase64("data:image/png;base64,abc123==");
    expect(result).toEqual({ mimeType: "image/png", content: "abc123==" });
  });

  it("returns null for invalid format", () => {
    expect(dataUrlToBase64("not-a-data-url")).toBeNull();
    expect(dataUrlToBase64("data:image/png;utf8,hello")).toBeNull();
  });
});

// ── extractText ─────────────────────────────────────────────────────────────────

describe("extractText", () => {
  it("returns string from text field", () => {
    expect(extractText({ text: "hello" })).toBe("hello");
  });

  it("returns string from content field", () => {
    expect(extractText({ content: "world" })).toBe("world");
  });

  it("concatenates text parts from content array", () => {
    expect(
      extractText({
        content: [
          { type: "text", text: "part1" },
          { type: "text", text: "part2" },
        ],
      })
    ).toBe("part1\npart2");
  });

  it("returns empty for null/undefined", () => {
    expect(extractText(null)).toBe("");
    expect(extractText(undefined)).toBe("");
  });

  it("returns string directly for string input", () => {
    expect(extractText("direct")).toBe("direct");
  });

  it("returns empty for empty content", () => {
    expect(extractText({ content: "" })).toBe("");
  });
});

// ── extractAttachmentsFromMessage ───────────────────────────────────────────────

describe("extractAttachmentsFromMessage", () => {
  it("returns empty for non-object", () => {
    expect(extractAttachmentsFromMessage(null)).toEqual([]);
    expect(extractAttachmentsFromMessage("string")).toEqual([]);
  });

  it("extracts image attachment with data field", () => {
    const result = extractAttachmentsFromMessage({
      content: [{ type: "image", data: "abc123", mimeType: "image/jpeg" }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("image");
    expect(result[0].dataUrl).toBe("data:image/jpeg;base64,abc123");
  });

  it("extracts image from source field", () => {
    const result = extractAttachmentsFromMessage({
      content: [
        {
          type: "image",
          source: { type: "base64", data: "xyz", media_type: "image/png" },
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].dataUrl).toContain("image/png");
  });

  it("skips text parts", () => {
    const result = extractAttachmentsFromMessage({
      content: [
        { type: "text", text: "hello" },
        { type: "image", data: "abc", mimeType: "image/png" },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("image");
  });
});

// ── extractToolCalls ────────────────────────────────────────────────────────────

describe("extractToolCalls", () => {
  it("returns empty for non-object input", () => {
    expect(extractToolCalls(null)).toEqual([]);
    expect(extractToolCalls(undefined)).toEqual([]);
    expect(extractToolCalls("string")).toEqual([]);
  });

  it("extracts tool calls from content array", () => {
    const result = extractToolCalls({
      content: [
        { type: "tool_use", id: "tc-1", name: "bash", arguments: { cmd: "ls" } },
        { type: "toolCall", id: "tc-2", name: "read", arguments: { path: "/tmp" } },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "tc-1", name: "bash", arguments: { cmd: "ls" } });
    expect(result[1]).toEqual({ id: "tc-2", name: "read", arguments: { path: "/tmp" } });
  });

  it("generates fallback id when missing", () => {
    const result = extractToolCalls({
      content: [{ type: "tool_use", name: "bash", arguments: {} }],
    });
    expect(result[0].id).toBe("tc-0");
  });

  it("returns empty when content is not an array", () => {
    expect(extractToolCalls({ content: "string" })).toEqual([]);
    expect(extractToolCalls({})).toEqual([]);
  });
});

// ── isHeartbeatMessage ──────────────────────────────────────────────────────────

describe("isHeartbeatMessage", () => {
  it("detects user heartbeat prompt", () => {
    expect(
      isHeartbeatMessage(
        "user",
        "Read HEARTBEAT.md if it exists (workspace context). Additional text."
      )
    ).toBe(true);
  });

  it("does not match assistant HEARTBEAT_OK because regex strips underscores", () => {
    expect(isHeartbeatMessage("assistant", "HEARTBEAT_OK")).toBe(false);
    expect(isHeartbeatMessage("assistant", "**HEARTBEAT_OK**")).toBe(false);
    expect(isHeartbeatMessage("assistant", "<p>HEARTBEAT_OK</p>")).toBe(false);
  });

  it("returns false for normal messages", () => {
    expect(isHeartbeatMessage("user", "hello")).toBe(false);
    expect(isHeartbeatMessage("assistant", "how can I help?")).toBe(false);
  });

  it("returns false for empty text", () => {
    expect(isHeartbeatMessage("user", "")).toBe(false);
    expect(isHeartbeatMessage("assistant", "  ")).toBe(false);
  });
});

// ── isApprovalContinueMessage ───────────────────────────────────────────────────

describe("isApprovalContinueMessage", () => {
  it("detects 'continue' from user", () => {
    expect(isApprovalContinueMessage("user", "continue")).toBe(true);
    expect(isApprovalContinueMessage("user", "Continue")).toBe(true);
    expect(isApprovalContinueMessage("user", " continue ")).toBe(true);
  });

  it("detects 'denied' from user", () => {
    expect(isApprovalContinueMessage("user", "denied")).toBe(true);
  });

  it("returns false for assistant role", () => {
    expect(isApprovalContinueMessage("assistant", "continue")).toBe(false);
  });

  it("returns false for multi-word messages", () => {
    expect(isApprovalContinueMessage("user", "please continue")).toBe(false);
  });

  it("returns false for non-approval tokens", () => {
    expect(isApprovalContinueMessage("user", "hello")).toBe(false);
  });
});

// ── parseHistoryMessages ────────────────────────────────────────────────────────

describe("parseHistoryMessages", () => {
  it("parses array of message objects", () => {
    const raw = [
      { role: "user", content: "hello", timestamp: 1000 },
      { role: "assistant", content: "world", timestamp: 2000 },
    ];
    const result = parseHistoryMessages(raw);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("user");
    expect(result[0].text).toBe("hello");
    expect(result[1].role).toBe("assistant");
    expect(result[1].text).toBe("world");
  });

  it("skips empty/null entries", () => {
    const raw = [null, undefined, { role: "user", content: "ok" }];
    const result = parseHistoryMessages(raw as unknown[]);
    expect(result).toHaveLength(1);
  });

  it("skips messages with no text and no attachments", () => {
    const raw = [{ role: "user", content: "" }];
    const result = parseHistoryMessages(raw);
    expect(result).toHaveLength(0);
  });

  it("assigns unknown role for missing/invalid role", () => {
    const raw = [{ content: "text" }];
    const result = parseHistoryMessages(raw);
    expect(result[0].role).toBe("unknown");
  });

  it("attaches toolResult to preceding assistant message", () => {
    const raw = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "let me run that" },
          { type: "tool_use", id: "tc-1", name: "bash", arguments: { cmd: "ls" } },
        ],
      },
      {
        role: "toolResult",
        toolCallId: "tc-1",
        toolName: "bash",
        content: "file1.txt\nfile2.txt",
      },
    ];
    const result = parseHistoryMessages(raw);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("assistant");
    expect(result[0].toolResults).toHaveLength(1);
    expect(result[0].toolResults![0].toolCallId).toBe("tc-1");
  });
});
