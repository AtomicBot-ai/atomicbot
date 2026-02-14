import React, { useState } from "react";
import Markdown, { type Components } from "react-markdown";
import { useSearchParams } from "react-router-dom";
import { useGatewayRpc } from "../gateway/context";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import {
  chatActions,
  extractAttachmentsFromMessage,
  extractText,
  isHeartbeatMessage,
  loadChatHistory,
  sendChatMessage,
  type ChatAttachmentInput,
  type UiMessageAttachment,
} from "../store/slices/chatSlice";
import type { GatewayState } from "../../../src/main/types";
import { ChatAttachmentCard, getFileTypeLabel } from "./ChatAttachmentCard";
import { ChatComposer, type ChatComposerRef } from "./ChatComposer";
import { useOptimisticSession } from "./optimisticSessionContext";
import { addToastError } from "./toast";

/** Parsed file attachment from user message text. */
type ParsedFileAttachment = { fileName: string; mimeType: string };

/**
 * Parse user message text that may contain media attachment markers.
 * Supports both core format: [media attached: path (mime)]
 * and legacy format: [Attached: name (mime)]
 * Returns display text (before first marker) and parsed file attachments.
 */
function parseUserMessageWithAttachments(text: string): {
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

  // Strip all attachment markers, <file> tags, the media-reply hint injected
  // by the gateway, and inbound-meta untrusted context blocks (conversation info,
  // sender, thread starter, replied message, forwarded context, chat history)
  // to recover the original user text regardless of marker position.
  let displayText = text
    .replace(/^(?:[^\n]*\(untrusted(?:\s+metadata|,\s+for context)\):\n```json\n[\s\S]*?\n```\s*)+(?:\[(?:[A-Za-z]{3}\s+)?\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}[^\]]*\]\s*)?/, "")
    .replace(/^\[(?:[A-Za-z]{3}\s+)?\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}[^\]]*\]\s*/, "")
    .replace(/\[media attached(?:\s+\d+\/\d+)?:\s*[^\]]+\]/g, "")
    .replace(/\[Attached:\s*[^\]]+\]/g, "")
    .replace(
      /To send an image back, prefer the message tool \(media\/path\/filePath\)\. If you must inline, use MEDIA:https:\/\/example\.com\/image\.jpg \(spaces ok, quote if needed\) or a safe relative path like MEDIA:\.\/image\.jpg\. Avoid absolute paths \(MEDIA:\/\.\.\.\) and ~ paths — they are blocked for security\. Keep caption in the text body\./g,
      ""
    )
    .replace(/<file\b[^>]*>[\s\S]*?(<\/file>|$)/g, "")
    .replace(/^\s*\[message_id:\s*[^\]]+\]\s*$/gm, "")
    .trim();

  return { displayText, fileAttachments };
}

function CopyIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M12 9.675V12.825C12 15.45 10.95 16.5 8.325 16.5H5.175C2.55 16.5 1.5 15.45 1.5 12.825V9.675C1.5 7.05 2.55 6 5.175 6H8.325C10.95 6 12 7.05 12 9.675Z"
        stroke="#8B8B8B"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M16.5 5.175V8.325C16.5 10.95 15.45 12 12.825 12H12V9.675C12 7.05 10.95 6 8.325 6H6V5.175C6 2.55 7.05 1.5 9.675 1.5H12.825C15.45 1.5 16.5 2.55 16.5 5.175Z"
        stroke="#8B8B8B"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M19.1333 7L8.59292 17.6L5 13.9867"
        stroke="#8B8B8B"
        stroke-opacity="1"
        stroke-width="2.06111"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/** Copy button with local state so only this message's icon toggles on copy. */
function CopyMessageButton({ text }: { text: string }) {
  const [isCopied, setIsCopied] = useState(false);
  return (
    <button
      type="button"
      className="UiChatMessageActionBtn"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 1500);
      }}
      aria-label={isCopied ? "Copied" : "Copy"}
    >
      {isCopied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

type ChatEvent = {
  runId: string;
  sessionKey: string;
  seq: number;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

export function ChatPage({ state: _state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  const [searchParams] = useSearchParams();
  const sessionKey = searchParams.get("session") ?? "";
  const [input, setInput] = React.useState("");
  const [attachments, setAttachments] = React.useState<ChatAttachmentInput[]>([]);
  const { optimistic, setOptimistic } = useOptimisticSession();
  /** Optimistic first message only for current thread (sessionKey matches). */
  const optimisticFirstMessage =
    optimistic?.key === sessionKey ? (optimistic.firstMessage ?? null) : null;
  const optimisticFirstAttachments =
    optimistic?.key === sessionKey ? (optimistic.firstAttachments ?? null) : null;

  const dispatch = useAppDispatch();
  const messages = useAppSelector((s) => s.chat.messages);
  const streamByRun = useAppSelector((s) => s.chat.streamByRun);
  const sending = useAppSelector((s) => s.chat.sending);
  const error = useAppSelector((s) => s.chat.error);

  const gw = useGatewayRpc();
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const composerRef = React.useRef<ChatComposerRef | null>(null);

  /** Override markdown links to open in the system browser instead of Electron. */
  const markdownComponents: Components = React.useMemo(
    () => ({
      a: ({ href, children, ...rest }) => (
        <a
          {...rest}
          href={href}
          onClick={(e) => {
            e.preventDefault();
            if (href) {
              window.openclawDesktop?.openExternal(href);
            }
          }}
        >
          {children}
        </a>
      ),
    }),
    [],
  );

  /** First user message in history that matches optimistic text; used for seamless handoff. */
  const matchingFirstUserFromHistory = React.useMemo(() => {
    if (optimisticFirstMessage === null) {return null;}
    const userMsg = messages.find(
      (m) => m.role === "user" && m.text.startsWith(optimisticFirstMessage)
    );
    return userMsg ?? null;
  }, [messages, optimisticFirstMessage]);

  // Clear optimistic session only when we're on that thread and chat.history has returned the matching user message.
  React.useEffect(() => {
    if (matchingFirstUserFromHistory !== null && optimistic?.key === sessionKey) {
      setOptimistic(null);
    }
  }, [matchingFirstUserFromHistory, optimistic?.key, sessionKey, setOptimistic]);

  React.useEffect(() => {
    return gw.onEvent((evt) => {
      if (evt.event !== "chat") {
        return;
      }
      const payload = evt.payload as ChatEvent;
      if (payload.sessionKey !== sessionKey) {
        return;
      }
      if (payload.state === "delta") {
        const text = extractText(payload.message);
        dispatch(chatActions.streamDeltaReceived({ runId: payload.runId, text }));
        return;
      }
      if (payload.state === "final") {
        const text = extractText(payload.message);
        const finalAttachments = extractAttachmentsFromMessage(payload.message);
        dispatch(
          chatActions.streamFinalReceived({
            runId: payload.runId,
            seq: payload.seq,
            text,
            attachments: finalAttachments.length > 0 ? finalAttachments : undefined,
          })
        );
        return;
      }
      if (payload.state === "error") {
        dispatch(
          chatActions.streamErrorReceived({
            runId: payload.runId,
            errorMessage: payload.errorMessage,
          })
        );
        return;
      }
      if (payload.state === "aborted") {
        dispatch(chatActions.streamAborted({ runId: payload.runId }));
      }
    });
  }, [dispatch, gw, sessionKey]);

  const refresh = React.useCallback(() => {
    void dispatch(loadChatHistory({ request: gw.request, sessionKey, limit: 200 }));
  }, [dispatch, gw.request, sessionKey]);

  // Clear transcript and reload history atomically when the session changes or
  // the component remounts (e.g. navigating back from settings).  Combining both
  // into a single effect eliminates the window where stale messages from the
  // previous mount could coexist with freshly-loaded history.
  React.useEffect(() => {
    dispatch(chatActions.sessionCleared());
    refresh();
  }, [sessionKey, dispatch, refresh]);

  // Focus input when opening chat page or switching between chats.
  React.useEffect(() => {
    const id = requestAnimationFrame(() => composerRef.current?.focusInput());
    return () => cancelAnimationFrame(id);
  }, [sessionKey]);

  // Derived list and waiting state (needed for scroll deps).
  const allMessages =
    matchingFirstUserFromHistory != null
      ? messages
      : optimisticFirstMessage != null
        ? [{ id: "opt-first", role: "user" as const, text: optimisticFirstMessage }, ...messages]
        : messages;
  const displayMessages = allMessages.filter(
    (m) =>
      (m.role === "user" || m.role === "assistant") &&
      m.text !== "[2 file(s)]" &&
      !isHeartbeatMessage(m.role, m.text)
  );

  // Hide loader as soon as the first stream delta arrives (streamByRun gets an entry).
  const waitingForFirstResponse =
    displayMessages.some((m) => m.role === "user") &&
    !displayMessages.some((m) => m.role === "assistant") &&
    Object.keys(streamByRun).length === 0;

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [messages.length, optimisticFirstMessage, streamByRun, waitingForFirstResponse]);

  React.useEffect(() => {
    if (error) {
      addToastError(error);
      dispatch(chatActions.setError(null));
    }
  }, [error, dispatch]);

  const send = React.useCallback(() => {
    const message = input.trim();
    const hasAttachments = attachments.length > 0;
    if (!message && !hasAttachments) {
      return;
    }
    const toSend = attachments.length > 0 ? [...attachments] : undefined;
    setInput("");
    setAttachments([]);
    void dispatch(
      sendChatMessage({ request: gw.request, sessionKey, message, attachments: toSend })
    );
  }, [dispatch, gw.request, input, sessionKey, attachments]);

  /** Stable key for the first user message so React doesn't remount when switching from optimistic to history. */
  const getMessageKey = (m: (typeof displayMessages)[number]) =>
    (optimisticFirstMessage != null && m.id === "opt-first") ||
    (matchingFirstUserFromHistory != null && m.id === matchingFirstUserFromHistory.id)
      ? "first-user"
      : m.id;

  return (
    <div className="UiChatShell">
      <div className="UiChatTranscript" ref={scrollRef}>
        {displayMessages.map((m) => {
          const attachmentsToShow: UiMessageAttachment[] =
            m.id === "opt-first" && optimisticFirstAttachments?.length
              ? optimisticFirstAttachments.map((att) => ({
                  type: att.mimeType?.startsWith("image/") ? "image" : "file",
                  mimeType: att.mimeType,
                  dataUrl: att.dataUrl,
                }))
              : (m.attachments ?? []);
          const parsedUser = m.role === "user" ? parseUserMessageWithAttachments(m.text) : null;
          const hasParsedFileAttachments =
            parsedUser != null && parsedUser.fileAttachments.length > 0;
          const messageText = parsedUser ? parsedUser.displayText : m.text;
          const showAttachmentsBlock = attachmentsToShow.length > 0 || hasParsedFileAttachments;
          return (
            <div key={getMessageKey(m)} className={`UiChatRow UiChatRow-${m.role}`}>
              <div className={`UiChatBubble UiChatBubble-${m.role}`}>
                {m.pending && (
                  <div className="UiChatBubbleMeta">
                    <span className="UiChatPending">sending…</span>
                  </div>
                )}
                {showAttachmentsBlock ? (
                  <div className="UiChatMessageAttachments">
                    {attachmentsToShow.map((att: UiMessageAttachment, idx: number) => {
                      const isImage = att.dataUrl && (att.mimeType?.startsWith("image/") ?? false);
                      if (isImage && att.dataUrl) {
                        const isGenerated = m.role === "assistant";
                        return (
                          <div
                            key={`${m.id}-att-${idx}`}
                            className={
                              isGenerated
                                ? "UiChatMessageAttachment UiChatMessageAttachment--generated"
                                : "UiChatMessageAttachment"
                            }
                          >
                            <img src={att.dataUrl} alt="" className="UiChatMessageAttachmentImg" />
                          </div>
                        );
                      }
                      const mimeType = att.mimeType ?? "application/octet-stream";
                      const skipFile = ["toolCall", "thinking"].includes(att.type);
                      if (skipFile) {return null;}
                      return (
                        <ChatAttachmentCard
                          key={`${m.id}-att-${idx}`}
                          fileName={getFileTypeLabel(mimeType)}
                          mimeType={mimeType}
                        />
                      );
                    })}
                    {hasParsedFileAttachments &&
                      parsedUser.fileAttachments.map((att, idx) => (
                        <ChatAttachmentCard
                          key={`${m.id}-parsed-${idx}`}
                          fileName={att.fileName}
                          mimeType={att.mimeType}
                        />
                      ))}
                  </div>
                ) : null}
                <div className="UiChatText UiMarkdown">
                  <Markdown components={markdownComponents}>{messageText}</Markdown>
                </div>
                {m.role === "assistant" && (
                  <div className="UiChatMessageActions">
                    <CopyMessageButton text={m.text} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {waitingForFirstResponse ? (
          <div className="UiChatRow UiChatRow-assistant">
            <div className="UiChatBubble UiChatBubble-assistant UiChatBubble-stream">
              <div className="UiChatBubbleMeta">
                <span className="UiChatPending">
                  <span className="UiChatTypingDots" aria-label="typing">
                    <span />
                    <span />
                    <span />
                  </span>
                </span>
              </div>
            </div>
          </div>
        ) : null}
        {Object.values(streamByRun).filter((m) => !isHeartbeatMessage(m.role, m.text)).map((m) => (
          <div key={m.id} className="UiChatRow UiChatRow-assistant">
            <div className="UiChatBubble UiChatBubble-assistant UiChatBubble-stream">
              <div className="UiChatBubbleMeta">
                <span className="UiChatPending">
                  <span className="UiChatTypingDots" aria-label="typing">
                    <span />
                    <span />
                    <span />
                  </span>
                </span>
              </div>
              {m.text ? (
                <div className="UiChatText UiMarkdown">
                  <Markdown components={markdownComponents}>{m.text}</Markdown>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <ChatComposer
        ref={composerRef}
        value={input}
        onChange={setInput}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        onSend={send}
        disabled={sending}
        onAttachmentsLimitError={(msg) => addToastError(msg)}
      />
    </div>
  );
}
