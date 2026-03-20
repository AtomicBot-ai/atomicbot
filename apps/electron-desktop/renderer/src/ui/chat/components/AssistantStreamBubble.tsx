import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { LoadingPhrase } from "./LoadingPhrase";
import am from "./AssistantMessage.module.css";
import ct from "../ChatTranscript.module.css";

/** Typing indicator with rotating phrases and shimmer (used while waiting for the first response). */
export function TypingIndicator(props: { classNameRoot?: string } = {}) {
  return (
    <div className={`${ct.UiChatRow} ${am["UiChatRow-assistant"]} ${props.classNameRoot ?? ""}`}>
      <div className={`${am["UiChatBubble-assistant"]} ${am["UiChatBubble-stream"]}`}>
        <div className="UiChatBubbleMeta">
          <LoadingPhrase />
        </div>
      </div>
    </div>
  );
}

/** A streaming assistant message bubble (with typing dots + partial text). */
export function AssistantStreamBubble(props: {
  id: string;
  text: string;
  markdownComponents: Components;
  classNameRoot?: string;
}) {
  return (
    <div className={`${ct.UiChatRow} ${am["UiChatRow-assistant"]} ${props.classNameRoot ?? ""}`}>
      <div className={`${am["UiChatBubble-assistant"]} ${am["UiChatBubble-stream"]}`}>
        {props.text ? (
          <div className="UiChatText UiMarkdown">
            <Markdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={props.markdownComponents}
            >
              {props.text}
            </Markdown>
          </div>
        ) : null}
      </div>
    </div>
  );
}
