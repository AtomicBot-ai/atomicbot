import type {
  UiToolCall,
  UiToolResult,
  LiveToolCall,
  UiMessageAttachment,
} from "@store/slices/chat/chatSlice";
import { ChatAttachmentCard, getFileTypeLabel } from "./ChatAttachmentCard";
import s from "./ToolCallCard.module.css";

/** Tool names that should be hidden from the chat UI. */
export const HIDDEN_TOOL_NAMES: ReadonlySet<string> = new Set(["process"]);

/** Human-readable labels for known tool names. */
const TOOL_LABELS: Record<string, string> = {
  exec: "Run command",
  read: "Read file",
  write: "Write file",
  search: "Search",
  browser: "Browser",
};

/** Human-readable label for a tool name (for ActionLog title, etc.). */
export function getToolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

/** Extract all tool arguments as displayable key-value entries. */
function getArgEntries(args: Record<string, unknown>): { key: string; value: string }[] {
  const entries: { key: string; value: string }[] = [];
  for (const [key, val] of Object.entries(args)) {
    if (val === undefined || val === null) continue;
    const str = typeof val === "string" ? val : JSON.stringify(val);
    entries.push({ key, value: str });
  }
  return entries;
}

/** Render images and file attachments from a tool result. */
function ToolResultAttachments({ attachments }: { attachments: UiMessageAttachment[] }) {
  const images = attachments.filter((a) => a.dataUrl && a.mimeType?.startsWith("image/"));
  const files = attachments.filter((a) => !(a.dataUrl && a.mimeType?.startsWith("image/")));

  return (
    <div className={s.ToolCallAttachments}>
      {images.map((att, idx) => (
        <div key={`img-${idx}`} className={s.ToolCallAttachmentImage}>
          <img src={att.dataUrl} alt="" className={s.ToolCallAttachmentImg} />
        </div>
      ))}
      {files.map((att, idx) => {
        const mimeType = att.mimeType ?? "application/octet-stream";
        return (
          <ChatAttachmentCard
            key={`file-${idx}`}
            fileName={getFileTypeLabel(mimeType)}
            mimeType={mimeType}
          />
        );
      })}
    </div>
  );
}

function ToolCallCardBody({ toolCall, result }: { toolCall: UiToolCall; result?: UiToolResult }) {
  const argEntries = getArgEntries(toolCall.arguments);
  const hasResult = Boolean(result?.text);
  const hasAttachments = Boolean(result?.attachments?.length);

  return (
    <div className={s.ToolCallBody}>
      {argEntries.map((entry) => (
        <div key={entry.key} className={s.ToolCallArgLine}>
          <span className={s.ToolCallArgKey}>{entry.key}:</span>{" "}
          <span className={s.ToolCallArgValue}>{entry.value}</span>
        </div>
      ))}

      {hasResult ? <div className={s.ToolCallResultText}>{result!.text}</div> : null}

      {result?.status ? (
        <div
          className={`${s.ToolCallStatusLine} ${
            ["approved", "completed"].includes(result.status)
              ? s["ToolCallStatusLine--approved"]
              : result.status === "denied"
                ? s["ToolCallStatusLine--denied"]
                : result.status === "approval-pending"
                  ? s["ToolCallStatusLine--pending"]
                  : ""
          }`}
        >
          <span className={s.ToolCallStatusIcon}>
            {["approved", "completed"].includes(result.status) && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="M13.3333 4L6 11.3333L2.66667 8"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            )}
            {result.status === "denied" && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M18 6L6 18M6 6L18 18"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            )}
            {result.status === "approval-pending" && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
              >
                <circle
                  cx="8"
                  cy="7.99984"
                  r="5.33333"
                  stroke="currentColor"
                  stroke-width="1.33333"
                />
                <path
                  d="M7.99992 5.8667V8.00003L9.06658 9.0667"
                  stroke="currentColor"
                  stroke-width="1.33333"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            )}
          </span>
          <span className={s.ToolCallStatusText}>
            {result.status === "approved" && "Approved"}
            {result.status === "denied" && "Denied"}
            {result.status === "approval-pending" && "Pending"}
            {result.status === "completed" && "Completed"}
          </span>
        </div>
      ) : null}

      {hasAttachments ? <ToolResultAttachments attachments={result!.attachments!} /> : null}
    </div>
  );
}

/** Render a single tool call as an inline collapsible section. */
export function ToolCallCard({
  toolCall,
  result,
}: {
  toolCall: UiToolCall;
  result?: UiToolResult;
}) {
  const label = TOOL_LABELS[toolCall.name] ?? toolCall.name;

  return (
    <div className={s.ToolCallCard}>
      <div className={`${s.ToolCallHeader} ${s["ToolCallHeader--static"]}`} aria-hidden>
        <span className={s.ToolCallLabel}>{label}</span>
      </div>
      <ToolCallCardBody toolCall={toolCall} result={result} />
    </div>
  );
}

/** Render a list of tool calls (and optionally their results). */
export function ToolCallCards({
  toolCalls,
  toolResults,
}: {
  toolCalls: UiToolCall[];
  toolResults?: UiToolResult[];
}) {
  const visible = toolCalls.filter((tc) => !HIDDEN_TOOL_NAMES.has(tc.name));
  if (!visible.length) {
    return null;
  }
  const resultMap = new Map<string, UiToolResult>();
  for (const r of toolResults ?? []) {
    if (r.toolCallId) {
      resultMap.set(r.toolCallId, r);
    }
  }
  return (
    <div className={s.ToolCallCards}>
      {visible.map((tc) => (
        <ToolCallCard key={tc.id} toolCall={tc} result={resultMap.get(tc.id)} />
      ))}
    </div>
  );
}

/** Render a single live tool call card (real-time via agent events). */
export function LiveToolCallCardItem({ tc }: { tc: LiveToolCall }) {
  const label = getToolLabel(tc.name);
  const isRunning = tc.phase === "start" || tc.phase === "update";
  const hasResult = Boolean(tc.resultText);
  const argEntries = getArgEntries(tc.arguments);

  return (
    <div className={s.ToolCallCard}>
      <div className={s.ToolCallHeader} aria-hidden>
        <span className={s.ToolCallLabel}>{label}</span>
      </div>
      <div className={s.ToolCallBody}>
        {argEntries.map((entry) => (
          <div key={entry.key} className={s.ToolCallArgLine}>
            <span className={s.ToolCallArgKey}>{entry.key}:</span>{" "}
            <span className={s.ToolCallArgValue}>{entry.value}</span>
          </div>
        ))}

        {hasResult ? <div className={s.ToolCallResultText}>{tc.resultText}</div> : null}

        {isRunning ? (
          <div className={`${s.ToolCallStatusLine} ${s["ToolCallStatusLine--running"]}`}>
            <span className={s.ToolCallStatusIcon}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M22 10C22 10 19.995 7.26822 18.3662 5.63824C16.7373 4.00827 14.4864 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C16.1031 21 19.5649 18.2543 20.6482 14.5M22 10V4M22 10H16"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
            <span className={s.ToolCallStatusText + " AnimatedTitleLoader"}>Running</span>
          </div>
        ) : tc.isError ? (
          <div className={`${s.ToolCallStatusLine} ${s["ToolCallStatusLine--error"]}`}>
            <span className={s.ToolCallStatusIcon}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M18 6L6 18M6 6L18 18"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
            <span className={s.ToolCallStatusText}>Error</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
