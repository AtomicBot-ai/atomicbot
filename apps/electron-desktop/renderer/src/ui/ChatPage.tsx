import React from "react";
import { useGatewayRpc } from "../gateway/context";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { chatActions, extractText, loadChatHistory, sendChatMessage } from "../store/slices/chatSlice";
import type { GatewayState } from "../../../src/main/types";

type ChatEvent = {
  runId: string;
  sessionKey: string;
  seq: number;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

export function ChatPage({ state: _state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  const sessionKey = "main";
  const [input, setInput] = React.useState("");
  const dispatch = useAppDispatch();
  const messages = useAppSelector((s) => s.chat.messages);
  const streamByRun = useAppSelector((s) => s.chat.streamByRun);
  const sending = useAppSelector((s) => s.chat.sending);
  const error = useAppSelector((s) => s.chat.error);

  const gw = useGatewayRpc();
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

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
        dispatch(chatActions.streamErrorReceived({ runId: payload.runId, errorMessage: payload.errorMessage }));
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

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    // Keep the latest content in view, like Control UI.
    el.scrollTop = el.scrollHeight;
  }, [messages, streamByRun]);

  const send = React.useCallback(() => {
    const message = input.trim();
    if (!message) {
      return;
    }
    setInput("");
    void dispatch(sendChatMessage({ request: gw.request, sessionKey, message }));
  }, [dispatch, gw.request, input, sessionKey]);

  return (
    <div className="ChatShell">
      {error ? <div className="ChatInlineError">{error}</div> : null}

      <div className="ChatTranscript" ref={scrollRef}>
        {messages.map((m) => (
          <div key={m.id} className={`ChatRow ChatRow-${m.role}`}>
            <div className={`ChatBubble ChatBubble-${m.role}`}>
              <div className="ChatBubbleMeta">
                <span className="ChatRole">{m.role}</span>
                {m.pending ? <span className="ChatPending">sending…</span> : null}
              </div>
              <div className="ChatText">{m.text}</div>
            </div>
          </div>
        ))}
        {Object.values(streamByRun).map((m) => (
          <div key={m.id} className="ChatRow ChatRow-assistant">
            <div className="ChatBubble ChatBubble-assistant ChatBubble-stream">
              <div className="ChatBubbleMeta">
                <span className="ChatRole">assistant</span>
                <span className="ChatPending">
                  <span className="ChatTypingDots" aria-label="typing">
                    <span />
                    <span />
                    <span />
                  </span>
                </span>
              </div>
              {m.text ? <div className="ChatText">{m.text}</div> : null}
            </div>
          </div>
        ))}
      </div>

      <div className="ChatComposer">
        <textarea
          className="ChatInput"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Write a message…"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="primary" onClick={send} disabled={sending || !input.trim()}>
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

