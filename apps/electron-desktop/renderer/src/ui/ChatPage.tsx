import React from "react";
import { useGatewayRpc } from "../gateway/context";

type ChatHistoryResult = {
  sessionKey: string;
  sessionId: string;
  messages: unknown[];
  thinkingLevel?: string;
};

type ChatEvent = {
  runId: string;
  sessionKey: string;
  seq: number;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

function extractText(msg: unknown): string {
  try {
    if (!msg || typeof msg !== "object") {
      return typeof msg === "string" ? msg : "";
    }
    const m = msg as { content?: unknown; text?: unknown };
    if (typeof m.text === "string" && m.text.trim()) {
      return m.text;
    }
    const content = m.content;
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

type UiMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "unknown";
  text: string;
  ts?: number;
  runId?: string;
  pending?: boolean;
};

function parseRole(value: unknown): UiMessage["role"] {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "user" || raw === "assistant" || raw === "system") {
    return raw;
  }
  return "unknown";
}

function parseHistoryMessages(raw: unknown[]): UiMessage[] {
  const out: UiMessage[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    if (!item || typeof item !== "object") {
      continue;
    }
    const msg = item as { role?: unknown; timestamp?: unknown };
    const role = parseRole(msg.role);
    const text = extractText(item);
    if (!text) {
      continue;
    }
    const ts =
      typeof msg.timestamp === "number" && Number.isFinite(msg.timestamp) ? Math.floor(msg.timestamp) : undefined;
    out.push({
      id: `h-${ts ?? 0}-${i}`,
      role,
      text,
      ts,
    });
  }
  return out;
}

export function ChatPage({ state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  const sessionKey = "main";
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<UiMessage[]>([]);
  const [streamByRun, setStreamByRun] = React.useState<Record<string, UiMessage>>({});
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
        setStreamByRun((prev) => ({
          ...prev,
          [payload.runId]: {
            id: `s-${payload.runId}`,
            role: "assistant",
            text,
            runId: payload.runId,
            ts: Date.now(),
          },
        }));
        return;
      }
      if (payload.state === "final") {
        const text = extractText(payload.message);
        setStreamByRun((prev) => {
          const next = { ...prev };
          delete next[payload.runId];
          return next;
        });
        if (text) {
          setMessages((prev) => [
            ...prev,
            {
              id: `a-${payload.runId}-${payload.seq}`,
              role: "assistant",
              text,
              runId: payload.runId,
              ts: Date.now(),
            },
          ]);
        }
        return;
      }
      if (payload.state === "error") {
        setStreamByRun((prev) => {
          const next = { ...prev };
          delete next[payload.runId];
          return next;
        });
        if (payload.errorMessage) {
          setError(payload.errorMessage);
        }
        return;
      }
      if (payload.state === "aborted") {
        setStreamByRun((prev) => {
          const next = { ...prev };
          delete next[payload.runId];
          return next;
        });
      }
    });
  }, [gw]);

  const refresh = React.useCallback(async () => {
    setError(null);
    try {
      const res = (await gw.request("chat.history", { sessionKey, limit: 200 })) as ChatHistoryResult;
      setMessages(parseHistoryMessages(res.messages));
      setStreamByRun({});
    } catch (err) {
      setError(String(err));
    }
  }, [gw, sessionKey]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    // Keep the latest content in view, like Control UI.
    el.scrollTop = el.scrollHeight;
  }, [messages, streamByRun]);

  const send = React.useCallback(async () => {
    const message = input.trim();
    if (!message) {
      return;
    }
    setInput("");
    setError(null);
    setSending(true);
    const localId = `u-${crypto.randomUUID()}`;
    const runId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      {
        id: localId,
        role: "user",
        text: message,
        ts: Date.now(),
        pending: true,
      },
    ]);
    // Show "typing" immediately, even before the first delta arrives.
    setStreamByRun((prev) => ({
      ...prev,
      [runId]: {
        id: `s-${runId}`,
        role: "assistant",
        text: "",
        runId,
        ts: Date.now(),
      },
    }));
    try {
      await gw.request("chat.send", {
        sessionKey,
        message,
        deliver: false,
        idempotencyKey: runId,
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === localId ? { ...m, pending: false } : m)),
      );
    } catch (err) {
      setError(String(err));
      setMessages((prev) =>
        prev.map((m) => (m.id === localId ? { ...m, pending: false } : m)),
      );
      setStreamByRun((prev) => {
        const next = { ...prev };
        delete next[runId];
        return next;
      });
    } finally {
      setSending(false);
    }
  }, [gw, input, sessionKey]);

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
              void send();
            }
          }}
        />
        <button className="primary" onClick={() => void send()} disabled={sending || !input.trim()}>
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

