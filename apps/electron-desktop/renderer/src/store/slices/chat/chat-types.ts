export type UiMessageAttachment = {
  type: string;
  mimeType?: string;
  dataUrl?: string;
};

/** A tool invocation extracted from assistant message content. */
export type UiToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

/** A tool result extracted from toolResult messages in the history. */
export type UiToolResult = {
  toolCallId: string;
  toolName: string;
  text: string;
  status?: string;
  /** Attachments (images/files) from the tool result content. */
  attachments?: UiMessageAttachment[];
};

export type UiMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "unknown";
  text: string;
  ts?: number;
  runId?: string;
  pending?: boolean;
  /** Attachments (images/files) from history; shown before message text. */
  attachments?: UiMessageAttachment[];
  /** Tool calls extracted from assistant message content. */
  toolCalls?: UiToolCall[];
  /** Tool results matched to the preceding assistant's tool calls. */
  toolResults?: UiToolResult[];
};

/** A tool call currently in-flight, streamed via agent events in real time. */
export type LiveToolCall = {
  toolCallId: string;
  runId: string;
  name: string;
  arguments: Record<string, unknown>;
  phase: "start" | "update" | "result";
  resultText?: string;
  isError?: boolean;
};

export type ChatSliceState = {
  messages: UiMessage[];
  streamByRun: Record<string, UiMessage>;
  sending: boolean;
  error: string | null;
  /** Monotonically increasing epoch; bumped on every sessionCleared so stale
   *  loadChatHistory results can be detected and discarded. */
  epoch: number;
  /** The session key that messages/streamByRun belong to.  Used by the UI to
   *  avoid rendering stale messages from a previous session during the single
   *  render that occurs between a navigation (which changes sessionKey
   *  immediately) and the sessionCleared effect (which runs after the render). */
  activeSessionKey: string;
  /** Tool calls currently in-flight, streamed via agent "tool" events. Keyed by toolCallId. */
  liveToolCalls: Record<string, LiveToolCall>;
  /** True while waiting for the agent to respond after an exec approval auto-continue. */
  awaitingContinuation: boolean;
  /** True while the session history RPC is in flight. Reset to true on sessionCleared
   *  (so navigation re-triggers the loader) and to false on historyLoaded / setError. */
  loadingHistory: boolean;
};

export type GatewayRequest = <T = unknown>(method: string, params?: unknown) => Promise<T>;

export type ChatAttachmentInput = {
  id: string;
  dataUrl: string;
  mimeType: string;
  /** Optional display name (e.g. from File.name). */
  fileName?: string;
};

export type ChatHistoryResult = {
  sessionKey: string;
  sessionId: string;
  messages: unknown[];
  thinkingLevel?: string;
};
