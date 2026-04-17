import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type {
  ChatSliceState,
  LiveToolCall,
  UiMessage,
  UiMessageAttachment,
  UiToolCall,
  UiToolResult,
} from "./chat-types";
import { isApprovalContinueMessage, isHeartbeatMessage } from "./parse-history-messages";

export type { ChatSliceState, UiMessage, UiToolCall, UiToolResult, LiveToolCall };
export type { UiMessageAttachment, GatewayRequest, ChatAttachmentInput } from "./chat-types";
export {
  dataUrlToBase64,
  extractText,
  extractAttachmentsFromMessage,
  extractToolCalls,
  extractToolResult,
  isApprovalContinueMessage,
  isHeartbeatMessage,
  normalizeMessageText,
  parseHistoryMessages,
  parseRole,
} from "./parse-history-messages";


const initialState: ChatSliceState = {
  messages: [],
  streamByRun: {},
  sending: false,
  error: null,
  epoch: 0,
  activeSessionKey: "",
  liveToolCalls: {},
  awaitingContinuation: false,
  loadingHistory: false,
};

/**
 * The gateway may send cumulative text in delta/final events — each event
 * contains ALL text from previous turns of the same runId concatenated with
 * the current turn's text.  Strip the already-finalized prefix so we only
 * store/display the new portion.
 *
 * Works because normalizeMessageText preserves trailing whitespace (no trim),
 * so join("") reproduces the exact cumulative byte sequence.
 */
function stripCumulativePrefix(text: string, runId: string, messages: UiMessage[]): string {
  if (!text) {
    return text;
  }
  const previousTexts: string[] = [];
  for (const m of messages) {
    if (m.runId === runId && m.role === "assistant" && m.text) {
      previousTexts.push(m.text);
    }
  }
  if (previousTexts.length === 0) {
    return text;
  }
  const combined = previousTexts.join("");
  return text.startsWith(combined) ? text.slice(combined.length) : text;
}

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    setSending(state, action: PayloadAction<boolean>) {
      state.sending = action.payload;
    },
    setAwaitingContinuation(state, action: PayloadAction<boolean>) {
      state.awaitingContinuation = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
      if (action.payload != null) {
        state.loadingHistory = false;
      }
    },
    /** Clear transcript when switching to another session so we don't show the previous thread. */
    sessionCleared(state, action: PayloadAction<string>) {
      state.messages = [];
      state.streamByRun = {};
      state.liveToolCalls = {};
      state.epoch += 1;
      state.activeSessionKey = action.payload;
      state.loadingHistory = true;
    },
    historyLoaded(state, action: PayloadAction<UiMessage[]>) {
      state.loadingHistory = false;
      const fromHistory = action.payload;
      const lastHistoryTs =
        fromHistory.length > 0 ? Math.max(...fromHistory.map((m) => m.ts ?? 0)) : 0;
      // Keep live messages (assistant stream finals + optimistic user messages)
      // that are newer than the latest server history entry and not yet persisted.
      // Deduplicate against history by text to avoid race-condition duplicates
      // (e.g. a stream final arriving between sessionCleared and historyLoaded).
      const historyTexts = new Set(fromHistory.map((m) => m.text));
      // Suffix-based dedup: stream text and history text may differ slightly
      // (whitespace, metadata stripping) but share the same tail.
      // Use max(100, 2/3 of the message length) as suffix to compare.
      const MIN_SUFFIX = 100;
      const historyTrimmed = fromHistory.map((m) => m.text.trim());
      const liveOnly: UiMessage[] = [];
      for (const m of state.messages) {
        if (m.ts == null || m.ts <= lastHistoryTs) {
          continue;
        }
        // Compare trimmed: live texts keep trailing whitespace for cumulative
        // prefix matching, while history texts are trimmed by parseHistoryMessages.
        const trimmed = m.text.trim();
        if (historyTexts.has(trimmed)) {
          continue;
        }
        if (m.role === "assistant" && trimmed.length >= MIN_SUFFIX) {
          const suffixLen = Math.max(MIN_SUFFIX, Math.floor((trimmed.length * 2) / 3));
          const liveSuffix = trimmed.slice(-suffixLen);
          if (
            historyTrimmed.some(
              (ht) => ht.length >= suffixLen && ht.slice(-suffixLen) === liveSuffix
            )
          ) {
            continue;
          }
        }
        if (m.role === "assistant" && m.runId) {
          liveOnly.push(m);
        } else if (m.role === "user") {
          liveOnly.push(m);
        }
      }
      state.messages =
        liveOnly.length > 0
          ? [
              ...fromHistory,
              ...[...liveOnly].sort((a: UiMessage, b: UiMessage) => (a.ts ?? 0) - (b.ts ?? 0)),
            ]
          : fromHistory;
      // Selectively clean up completed streams instead of clearing all.
      // Active streams for in-flight runs must persist so the UI keeps
      // showing the typing indicator for pending responses.
      const finalizedRunIds = new Set<string>();
      for (const m of state.messages) {
        if (m.role === "assistant" && m.runId) {
          finalizedRunIds.add(m.runId);
        }
      }
      for (const runId of Object.keys(state.streamByRun)) {
        if (finalizedRunIds.has(runId)) {
          delete state.streamByRun[runId];
        }
      }

      // Resolve approval-pending statuses and clear the loader when the
      // closing continue/denied message has appeared in history.
      const allMsgs = state.messages;
      for (let i = 0; i < allMsgs.length; i++) {
        const msg = allMsgs[i];
        if (!msg.toolResults?.some((r) => r.status === "approval-pending")) {
          continue;
        }
        let resolvedAs: "approved" | "denied" | null = null;
        for (let j = i + 1; j < allMsgs.length; j++) {
          if (isApprovalContinueMessage(allMsgs[j].role, allMsgs[j].text)) {
            const word = allMsgs[j].text.trim().toLowerCase();
            resolvedAs = word === "denied" ? "denied" : "approved";
            break;
          }
        }
        if (resolvedAs && msg.toolResults) {
          for (const r of msg.toolResults) {
            if (r.status === "approval-pending") {
              r.status = resolvedAs;
            }
          }
        }
      }

      if (state.awaitingContinuation) {
        const hasPendingLeft = allMsgs.some((m) =>
          m.toolResults?.some((r) => r.status === "approval-pending")
        );
        if (!hasPendingLeft) {
          state.awaitingContinuation = false;
        }
      }
    },
    userMessageQueued(
      state,
      action: PayloadAction<{
        localId: string;
        message: string;
        attachments?: UiMessageAttachment[];
      }>
    ) {
      state.messages.push({
        id: action.payload.localId,
        role: "user",
        text: action.payload.message,
        ts: Date.now(),
        pending: true,
        attachments: action.payload.attachments,
      });
    },
    markUserMessageDelivered(state, action: PayloadAction<{ localId: string }>) {
      state.messages = state.messages.map((m) =>
        m.id === action.payload.localId ? { ...m, pending: false } : m
      );
    },
    ensureStreamRun(state, action: PayloadAction<{ runId: string }>) {
      const runId = action.payload.runId;
      if (state.streamByRun[runId]) {
        return;
      }
      state.streamByRun[runId] = {
        id: `s-${runId}`,
        role: "assistant",
        text: "",
        runId,
        ts: Date.now(),
      };
    },
    streamDeltaReceived(state, action: PayloadAction<{ runId: string; text: string }>) {
      const runId = action.payload.runId;
      if (isHeartbeatMessage("assistant", action.payload.text)) {
        return;
      }
      const text = stripCumulativePrefix(action.payload.text, runId, state.messages);
      state.streamByRun[runId] = {
        id: `s-${runId}`,
        role: "assistant",
        text,
        runId,
        ts: Date.now(),
      };
    },
    streamFinalReceived(
      state,
      action: PayloadAction<{
        runId: string;
        seq: number;
        text: string;
        toolCalls?: UiToolCall[];
      }>
    ) {
      const { runId, seq, text, toolCalls } = action.payload;
      delete state.streamByRun[runId];

      const liveForRun: UiToolCall[] = [];
      const liveResultsForRun: UiToolResult[] = [];
      for (const key of Object.keys(state.liveToolCalls)) {
        const ltc = state.liveToolCalls[key];
        if (ltc.runId === runId) {
          liveForRun.push({
            id: ltc.toolCallId,
            name: ltc.name,
            arguments: ltc.arguments,
          });
          if (ltc.phase === "result" && ltc.resultText) {
            liveResultsForRun.push({
              toolCallId: ltc.toolCallId,
              toolName: ltc.name,
              text: ltc.resultText,
              status: ltc.isError ? "error" : undefined,
            });
          }
          delete state.liveToolCalls[key];
        }
      }

      const allToolCalls = [
        ...(toolCalls ?? []),
        ...liveForRun.filter((ltc) => !toolCalls?.some((tc) => tc.id === ltc.id)),
      ];
      const hasToolCalls = allToolCalls.length > 0;

      const effectiveText = stripCumulativePrefix(text, runId, state.messages);

      if (!effectiveText && !hasToolCalls) {
        return;
      }
      if (effectiveText && isHeartbeatMessage("assistant", effectiveText)) {
        return;
      }
      state.messages.push({
        id: `a-${runId}-${seq}`,
        role: "assistant",
        text: effectiveText,
        runId,
        ts: Date.now(),
        toolCalls: hasToolCalls ? allToolCalls : undefined,
        toolResults: liveResultsForRun.length > 0 ? liveResultsForRun : undefined,
      });
    },
    streamErrorReceived(state, action: PayloadAction<{ runId: string; errorMessage?: string }>) {
      delete state.streamByRun[action.payload.runId];
      if (action.payload.errorMessage) {
        state.error = action.payload.errorMessage;
      }
    },
    streamAborted(state, action: PayloadAction<{ runId: string }>) {
      delete state.streamByRun[action.payload.runId];
    },
    streamCleared(state, action: PayloadAction<{ runId: string }>) {
      delete state.streamByRun[action.payload.runId];
    },
    /** A tool call started (agent event with stream="tool", phase="start"). */
    toolCallStarted(
      state,
      action: PayloadAction<{
        toolCallId: string;
        runId: string;
        name: string;
        arguments: Record<string, unknown>;
      }>
    ) {
      const { toolCallId, runId, name, arguments: args } = action.payload;
      state.liveToolCalls[toolCallId] = {
        toolCallId,
        runId,
        name,
        arguments: args,
        phase: "start",
      };
    },
    /** A tool call finished (agent event with stream="tool", phase="result"). */
    toolCallFinished(
      state,
      action: PayloadAction<{
        toolCallId: string;
        resultText?: string;
        isError?: boolean;
      }>
    ) {
      const entry = state.liveToolCalls[action.payload.toolCallId];
      if (entry) {
        entry.phase = "result";
        entry.resultText = action.payload.resultText;
        entry.isError = action.payload.isError;
      }
    },
    /** Clear all live tool calls for a given runId (e.g. when the run finishes). */
    liveToolCallsClearedForRun(state, action: PayloadAction<{ runId: string }>) {
      for (const key of Object.keys(state.liveToolCalls)) {
        if (state.liveToolCalls[key].runId === action.payload.runId) {
          delete state.liveToolCalls[key];
        }
      }
    },
  },
});

export const chatActions = chatSlice.actions;
export const chatReducer = chatSlice.reducer;
