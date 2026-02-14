import React, { useState } from "react";
import Markdown, { type Components } from "react-markdown";
import { useSearchParams } from "react-router-dom";
import { getDesktopApiOrNull } from "../../ipc/desktopApi";
import { useGatewayRpc } from "../../gateway/context";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  chatActions,
  extractText,
  isHeartbeatMessage,
  loadChatHistory,
  sendChatMessage,
  type ChatAttachmentInput,
  type UiMessageAttachment,
} from "../../store/slices/chatSlice";
import type { GatewayState } from "../../../../src/main/types";
import { ChatAttachmentCard, getFileTypeLabel } from "./ChatAttachmentCard";
import { ChatComposer, type ChatComposerRef } from "./ChatComposer";
import { useOptimisticSession } from "./optimisticSessionContext";
import { addToastError } from "../shared/toast";
import { parseUserMessageWithAttachments } from "./messageParser";
import { CopyMessageButton } from "./CopyMessageButton";

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
              getDesktopApiOrNull()?.openExternal(href);
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
        dispatch(chatActions.streamFinalReceived({ runId: payload.runId, seq: payload.seq, text }));
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
                        return (
                          <div key={`${m.id}-att-${idx}`} className="UiChatMessageAttachment">
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
