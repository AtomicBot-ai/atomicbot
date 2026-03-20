import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

import type { UiMessageAttachment } from "@store/slices/chat/chatSlice";
import { ChatAttachmentCard, getFileTypeLabel } from "./ChatAttachmentCard";
import { parseUserMessageWithAttachments } from "../hooks/messageParser";
import ub from "./UserMessageBubble.module.css";
import cc from "./ChatComposer.module.css";
import ct from "../ChatTranscript.module.css";

export function UserMessageBubble(props: {
  id: string;
  text: string;
  pending?: boolean;
  attachments: UiMessageAttachment[];
  markdownComponents: Components;
}) {
  const parsed = parseUserMessageWithAttachments(props.text);
  const hasParsedFileAttachments = parsed.fileAttachments.length > 0;
  const messageText = parsed.displayText;
  const showAttachmentsBlock = props.attachments.length > 0 || hasParsedFileAttachments;

  return (
    <div className={`${ct.UiChatRow} ${ub["UiChatRow-user"]}`}>
      <div className={ub["UiChatBubble-user"]}>
        {props.pending && (
          <div className="UiChatBubbleMeta">
            <span className="UiChatPending">sending…</span>
          </div>
        )}
        {showAttachmentsBlock ? (
          <div className={cc.UiChatMessageAttachments}>
            {props.attachments.map((att: UiMessageAttachment, idx: number) => {
              const isImage = att.dataUrl && (att.mimeType?.startsWith("image/") ?? false);
              if (isImage && att.dataUrl) {
                return (
                  <div key={`${props.id}-att-${idx}`} className={cc.UiChatMessageAttachment}>
                    <img src={att.dataUrl} alt="" className={cc.UiChatMessageAttachmentImg} />
                  </div>
                );
              }
              const mimeType = att.mimeType ?? "application/octet-stream";
              const skipFile = ["toolCall", "thinking"].includes(att.type);
              if (skipFile) {
                return null;
              }
              return (
                <ChatAttachmentCard
                  key={`${props.id}-att-${idx}`}
                  fileName={getFileTypeLabel(mimeType)}
                  mimeType={mimeType}
                />
              );
            })}
            {hasParsedFileAttachments &&
              parsed.fileAttachments.map((att, idx) => (
                <ChatAttachmentCard
                  key={`${props.id}-parsed-${idx}`}
                  fileName={att.fileName}
                  mimeType={att.mimeType}
                />
              ))}
          </div>
        ) : null}
        <div className="UiChatText UiMarkdown">
          <Markdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={props.markdownComponents}
          >
            {messageText}
          </Markdown>
        </div>
      </div>
    </div>
  );
}
