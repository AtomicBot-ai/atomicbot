import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "../../store";
import { errorToMessage } from "../../../ui/shared/toast";
import type {
  ChatAttachmentInput,
  ChatHistoryResult,
  GatewayRequest,
  UiMessageAttachment,
} from "./chat-types";
import { dataUrlToBase64, parseHistoryMessages } from "./chat-utils";
import { chatActions } from "./chatSlice";
import { captureRenderer, ANALYTICS_EVENTS } from "@analytics";

export const loadChatHistory = createAsyncThunk(
  "chat/loadChatHistory",
  async (
    {
      request,
      sessionKey,
      limit = 200,
    }: { request: GatewayRequest; sessionKey: string; limit?: number },
    thunkApi
  ) => {
    thunkApi.dispatch(chatActions.setError(null));
    // Capture epoch before the async fetch so we can discard stale results
    // (e.g. when the user navigated away and back, triggering sessionCleared).
    const epochBefore = (thunkApi.getState() as RootState).chat.epoch;
    const res = await request<ChatHistoryResult>("chat.history", { sessionKey, limit });
    const epochAfter = (thunkApi.getState() as RootState).chat.epoch;
    if (epochAfter !== epochBefore) {
      return;
    }
    thunkApi.dispatch(chatActions.historyLoaded(parseHistoryMessages(res.messages)));
  }
);

export const sendChatMessage = createAsyncThunk(
  "chat/sendChatMessage",
  async (
    {
      request,
      sessionKey,
      message,
      attachments,
    }: {
      request: GatewayRequest;
      sessionKey: string;
      message: string;
      attachments?: ChatAttachmentInput[];
    },
    thunkApi
  ) => {
    const trimmed = message.trim();
    const hasAttachments = Boolean(attachments?.length);
    if (!trimmed && !hasAttachments) {
      return;
    }

    thunkApi.dispatch(chatActions.setError(null));
    thunkApi.dispatch(chatActions.setSending(true));

    const localId = `u-${crypto.randomUUID()}`;
    const runId = crypto.randomUUID();
    const displayMessage = trimmed || (hasAttachments ? `[${attachments!.length} file(s)]` : "");

    const uiAttachments: UiMessageAttachment[] | undefined = attachments?.length
      ? attachments.map((att) => ({
          type: att.mimeType.startsWith("image/") ? "image" : "file",
          mimeType: att.mimeType,
          dataUrl: att.dataUrl,
        }))
      : undefined;

    thunkApi.dispatch(
      chatActions.userMessageQueued({
        localId,
        message: displayMessage,
        attachments: uiAttachments,
      })
    );
    thunkApi.dispatch(chatActions.ensureStreamRun({ runId }));

    const apiAttachments =
      attachments
        ?.map((att) => {
          const parsed = dataUrlToBase64(att.dataUrl);
          if (!parsed) {
            return null;
          }
          const isImage = parsed.mimeType.startsWith("image/");
          return {
            type: isImage ? "image" : "file",
            mimeType: parsed.mimeType,
            fileName: att.fileName,
            content: parsed.content,
          };
        })
        .filter(
          (
            a
          ): a is {
            type: "image" | "file";
            mimeType: string;
            fileName: string | undefined;
            content: string;
          } => a !== null
        ) ?? [];

    try {
      await request("chat.send", {
        sessionKey,
        message: trimmed,
        deliver: false,
        idempotencyKey: runId,
        ...(apiAttachments.length > 0 ? { attachments: apiAttachments } : {}),
      });
      captureRenderer(ANALYTICS_EVENTS.messageSent);
      thunkApi.dispatch(chatActions.markUserMessageDelivered({ localId }));
    } catch (err) {
      console.error("[Chat] sendChatMessage failed:", {
        error: err,
        sessionKey,
        runId,
        message: message.slice(0, 100),
      });
      thunkApi.dispatch(chatActions.markUserMessageDelivered({ localId }));
      thunkApi.dispatch(chatActions.streamCleared({ runId }));
      thunkApi.dispatch(chatActions.setError(errorToMessage(err)));
    } finally {
      thunkApi.dispatch(chatActions.setSending(false));
    }
  }
);
