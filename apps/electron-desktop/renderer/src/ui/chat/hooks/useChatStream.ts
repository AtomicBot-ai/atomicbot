import React from "react";
import type { AppDispatch } from "@store/store";
import {
  chatActions,
  extractText,
  extractToolCalls,
  normalizeMessageText,
} from "@store/slices/chat/chatSlice";
import { loadChatHistory } from "@store/slices/chat/chat-thunks";
import { HIDDEN_TOOL_NAMES } from "../components/ToolCallCard";
import type { GatewayRpcLike } from "../../onboarding/hooks/types";
import { notifyInBackground } from "../../app/background-notifications";
import { markdownToPlainText } from "@lib/markdown-to-plain";

const HISTORY_RELOAD_DELAY_MS = 500;
const NOTIFICATION_PREVIEW_MAX_CHARS = 140;

function buildAgentFinishedBody(text: string): string {
  const plain = markdownToPlainText(text);
  if (!plain) {
    return "Agent finished.";
  }
  if (plain.length <= NOTIFICATION_PREVIEW_MAX_CHARS) {
    return plain;
  }
  return `${plain.slice(0, NOTIFICATION_PREVIEW_MAX_CHARS - 1)}\u2026`;
}

type ChatGatewayRpc = GatewayRpcLike & {
  onEvent: (cb: (evt: { event: string; payload: unknown }) => void) => () => void;
};

type ChatEvent = {
  runId: string;
  sessionKey: string;
  seq: number;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

type AgentEvent = {
  runId: string;
  seq: number;
  stream: string;
  ts: number;
  sessionKey?: string;
  data: Record<string, unknown>;
};

/** Subscribe to gateway chat events and dispatch stream actions for the given session. */
export function useChatStream(gw: ChatGatewayRpc, dispatch: AppDispatch, sessionKey: string) {
  React.useEffect(() => {
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = gw.onEvent((evt) => {
      // Handle chat events (text streaming)
      if (evt.event === "chat") {
        const payload = evt.payload as ChatEvent;
        if (payload.sessionKey !== sessionKey) {
          return;
        }
        if (payload.state === "delta") {
          const text = normalizeMessageText(extractText(payload.message));
          dispatch(chatActions.streamDeltaReceived({ runId: payload.runId, text }));
          return;
        }
        if (payload.state === "final") {
          const rawText = extractText(payload.message);
          const text = normalizeMessageText(rawText);
          const toolCalls = extractToolCalls(payload.message);
          dispatch(
            chatActions.streamFinalReceived({
              runId: payload.runId,
              seq: payload.seq,
              text,
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            })
          );
          notifyInBackground({
            title: "Atomic Bot",
            body: buildAgentFinishedBody(text),
          });
          // Debounce history reload so rapid sequential finals (multi-turn agent
          // runs) coalesce into a single fetch, reducing visual re-layout churn.
          if (reloadTimer) {
            clearTimeout(reloadTimer);
          }
          reloadTimer = setTimeout(() => {
            reloadTimer = null;
            void dispatch(loadChatHistory({ request: gw.request, sessionKey, limit: 200 }));
          }, HISTORY_RELOAD_DELAY_MS);
          return;
        }
        if (payload.state === "error") {
          dispatch(
            chatActions.streamErrorReceived({
              runId: payload.runId,
              errorMessage: payload.errorMessage,
            })
          );
          notifyInBackground({
            title: "Atomic Bot",
            body: payload.errorMessage
              ? `Agent run failed: ${payload.errorMessage}`
              : "Agent run failed.",
          });
          return;
        }
        if (payload.state === "aborted") {
          dispatch(chatActions.streamAborted({ runId: payload.runId }));
          notifyInBackground({
            title: "Atomic Bot",
            body: "Agent run was aborted.",
          });
        }
        return;
      }

      // Handle agent events (tool call streaming)
      if (evt.event === "agent") {
        const payload = evt.payload as AgentEvent;
        if (payload.sessionKey && payload.sessionKey !== sessionKey) {
          return;
        }
        if (payload.stream !== "tool") {
          return;
        }
        const { data, runId } = payload;
        const phase = typeof data.phase === "string" ? data.phase : "";
        const toolCallId = typeof data.toolCallId === "string" ? data.toolCallId : "";
        const name = typeof data.name === "string" ? data.name : "";

        if (phase === "start" && toolCallId && name) {
          if (HIDDEN_TOOL_NAMES.has(name)) {
            return;
          }
          const args =
            data.args && typeof data.args === "object"
              ? (data.args as Record<string, unknown>)
              : {};
          dispatch(chatActions.toolCallStarted({ toolCallId, runId, name, arguments: args }));
          return;
        }
        if (phase === "result" && toolCallId) {
          const resultText =
            typeof data.result === "string"
              ? data.result
              : data.result != null
                ? JSON.stringify(data.result, null, 2)
                : undefined;
          dispatch(
            chatActions.toolCallFinished({
              toolCallId,
              resultText,
              isError: typeof data.isError === "boolean" ? data.isError : undefined,
            })
          );
        }
      }
    });

    return () => {
      unsubscribe();
      if (reloadTimer) {
        clearTimeout(reloadTimer);
      }
    };
  }, [dispatch, gw, sessionKey]);
}
