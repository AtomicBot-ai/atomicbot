import { stripMetadata } from "@lib/message-strip";
import type { UiMessage, UiMessageAttachment, UiToolCall, UiToolResult } from "./chat-types";

/**
 * Strip gateway-injected metadata from message text.  Intentionally does NOT
 * trim — trailing/leading whitespace is preserved so cumulative prefix
 * matching in the chat slice works correctly across multi-turn runs.
 */
export function normalizeMessageText(text: string): string {
  return stripMetadata(text);
}

export function dataUrlToBase64(dataUrl: string): { content: string; mimeType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return null;
  }
  return { mimeType: match[1], content: match[2] };
}

export function extractText(msg: unknown): string {
  try {
    if (!msg || typeof msg !== "object") {
      return typeof msg === "string" ? msg : "";
    }
    const m = msg as { content?: unknown; text?: unknown };
    if (typeof m.text === "string" && m.text.trim()) {
      return m.text;
    }
    const content = m.content;
    if (typeof content === "string") {
      return content.trim() ? content : "";
    }
    if (!Array.isArray(content)) {
      return "";
    }
    const parts = content
      .map((p) => {
        if (!p || typeof p !== "object") {
          return "";
        }
        const part = p as { type?: unknown; text?: unknown };
        if (part.type === "text" && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .filter(Boolean);
    return parts.join("\n");
  } catch {
    return "";
  }
}

/** Extract attachment blocks from a history message for display (images as dataUrl, others as icon). */
export function extractAttachmentsFromMessage(msg: unknown): UiMessageAttachment[] {
  const out: UiMessageAttachment[] = [];
  try {
    if (!msg || typeof msg !== "object") {
      return out;
    }
    const m = msg as { content?: unknown };
    const content = m.content;
    if (!Array.isArray(content)) {
      return out;
    }
    for (const p of content) {
      if (!p || typeof p !== "object") {
        continue;
      }
      const part = p as {
        type?: unknown;
        text?: unknown;
        data?: unknown;
        mimeType?: unknown;
        source?: { type?: unknown; data?: unknown; media_type?: unknown };
      };
      const type = typeof part.type === "string" ? part.type : "";
      if (type === "text") {
        continue;
      }
      let dataUrl: string | undefined;
      let mimeType: string | undefined;
      if (type === "image" && (typeof part.data === "string" || part.source)) {
        const data =
          typeof part.data === "string"
            ? part.data
            : typeof part.source?.data === "string"
              ? part.source.data
              : undefined;
        const mediaType =
          typeof part.mimeType === "string"
            ? part.mimeType
            : typeof part.source?.media_type === "string"
              ? part.source.media_type
              : "image/png";
        if (data) {
          dataUrl = `data:${mediaType};base64,${data}`;
          mimeType = mediaType;
        }
      }
      out.push({
        type: type || "file",
        mimeType: mimeType || (typeof part.mimeType === "string" ? part.mimeType : undefined),
        dataUrl,
      });
    }
  } catch {
    // ignore
  }
  return out;
}

const HEARTBEAT_PROMPT_PREFIX = "Read HEARTBEAT.md if it exists (workspace context).";
const HEARTBEAT_OK_TOKEN = "HEARTBEAT_OK";

/** Messages auto-sent after exec approval that should be hidden from the UI. */
const APPROVAL_CONTINUE_TOKENS = new Set(["continue", "denied"]);

/** Detect auto-continue messages sent after exec approval (single-word message). */
export function isApprovalContinueMessage(role: string, text: string): boolean {
  if (role !== "user") {
    return false;
  }
  const trimmed = text.trim().toLowerCase();
  return !trimmed.includes(" ") && APPROVAL_CONTINUE_TOKENS.has(trimmed);
}

/** Detect heartbeat-related messages that should be hidden from the chat UI. */
export function isHeartbeatMessage(role: string, text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  // User-side: the heartbeat prompt injected by the gateway.
  // Use includes() because gateway may prepend metadata (date headers, etc.).
  if (role === "user" && trimmed.includes(HEARTBEAT_PROMPT_PREFIX)) {
    return true;
  }
  // Assistant-side: HEARTBEAT_OK acknowledgment (possibly with light markup or surrounding text)
  if (role === "assistant") {
    const stripped = trimmed
      .replace(/<[^>]*>/g, " ")
      .replace(/[*`~_]+/g, "")
      .trim();
    if (stripped === HEARTBEAT_OK_TOKEN || stripped.includes(HEARTBEAT_OK_TOKEN)) {
      return true;
    }
  }
  return false;
}

export function parseRole(value: unknown): UiMessage["role"] {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "user" || raw === "assistant" || raw === "system") {
    return raw;
  }
  return "unknown";
}

/** Extract tool calls from an assistant message's content array. */
export function extractToolCalls(msg: unknown): UiToolCall[] {
  const out: UiToolCall[] = [];
  if (!msg || typeof msg !== "object") {
    return out;
  }
  const m = msg as { content?: unknown };
  if (!Array.isArray(m.content)) {
    return out;
  }
  for (const part of m.content) {
    if (!part || typeof part !== "object") {
      continue;
    }
    const p = part as { type?: string; id?: string; name?: string; arguments?: unknown };
    const t = typeof p.type === "string" ? p.type.toLowerCase() : "";
    if (
      (t === "toolcall" || t === "tool_call" || t === "tooluse" || t === "tool_use") &&
      typeof p.name === "string"
    ) {
      out.push({
        id: typeof p.id === "string" ? p.id : `tc-${out.length}`,
        name: p.name,
        arguments:
          p.arguments && typeof p.arguments === "object"
            ? (p.arguments as Record<string, unknown>)
            : {},
      });
    }
  }
  return out;
}

/** Extract tool result info from a toolResult-role message. */
export function extractToolResult(msg: unknown): UiToolResult | null {
  if (!msg || typeof msg !== "object") {
    return null;
  }
  const m = msg as {
    role?: string;
    toolCallId?: string;
    toolName?: string;
    content?: unknown;
    details?: { status?: string };
  };
  const role = typeof m.role === "string" ? m.role : "";
  if (role !== "toolResult" && role !== "tool_result") {
    return null;
  }
  const text = extractText(msg);
  const attachments = extractAttachmentsFromMessage(msg);
  return {
    toolCallId: typeof m.toolCallId === "string" ? m.toolCallId : "",
    toolName: typeof m.toolName === "string" ? m.toolName : "unknown",
    text,
    status: typeof m.details?.status === "string" ? m.details.status : undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}

export function parseHistoryMessages(raw: unknown[]): UiMessage[] {
  const out: UiMessage[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    if (!item || typeof item !== "object") {
      continue;
    }
    const msg = item as { role?: unknown; timestamp?: unknown };
    const rawRole = typeof msg.role === "string" ? msg.role : "";

    // Handle toolResult messages: attach results to the preceding assistant message.
    if (rawRole === "toolResult" || rawRole === "tool_result") {
      const result = extractToolResult(item);
      if (result && out.length > 0) {
        const prev = out[out.length - 1];
        if (prev.role === "assistant") {
          prev.toolResults = [...(prev.toolResults ?? []), result];
        }
      }
      continue;
    }

    const role = parseRole(msg.role);
    const text = extractText(item);
    const toolCalls = role === "assistant" ? extractToolCalls(item) : [];
    const attachments = extractAttachmentsFromMessage(item);
    const hasAttachments = attachments.length > 0;
    const hasToolCalls = toolCalls.length > 0;
    if (!text && !hasAttachments && !hasToolCalls) {
      continue;
    }
    // Hide heartbeat prompts and ack responses from chat history
    if (text && isHeartbeatMessage(role, text)) {
      continue;
    }
    // Strip gateway-injected metadata so the UI shows only the actual message content.
    const displayText = text ? stripMetadata(text).trim() : "";
    const ts =
      typeof msg.timestamp === "number" && Number.isFinite(msg.timestamp)
        ? Math.floor(msg.timestamp)
        : undefined;
    out.push({
      id: `h-${ts ?? 0}-${i}`,
      role,
      text: displayText,
      ts,
      attachments: hasAttachments ? attachments : undefined,
      toolCalls: hasToolCalls ? toolCalls : undefined,
    });
  }
  return out;
}
