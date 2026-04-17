import React from "react";
import type { ChatAttachmentInput } from "@store/slices/chat/chatSlice";
import type { DownloadStatus } from "@store/slices/whisperSlice";
import { ChatAttachmentCard, getFileTypeLabel } from "./ChatAttachmentCard";
import { WhisperDownloadTooltip } from "./WhisperDownloadTooltip";
import { MicrophoneIcon, SendIcon } from "@shared/kit/icons";
import { MAX_ATTACHMENTS_DEFAULT } from "../utils/file-limits";
import { useFileAttachments } from "../hooks/useFileAttachments";
import s from "./ChatComposer.module.css";

export type ChatComposerRef = { focusInput: () => void };

export type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  attachments: ChatAttachmentInput[];
  onAttachmentsChange: (
    next: ChatAttachmentInput[] | ((prev: ChatAttachmentInput[]) => ChatAttachmentInput[])
  ) => void;
  onSend: () => void;
  disabled?: boolean;
  streaming?: boolean;
  onStop?: () => void;
  sendLabel?: string;
  sendingLabel?: string;
  stopLabel?: string;
  placeholder?: string;
  maxAttachments?: number;
  onAttachmentsLimitError?: (message: string) => void;
  isVoiceRecording?: boolean;
  isVoiceProcessing?: boolean;
  onVoiceStart?: () => void;
  onVoiceStop?: () => void;
  voiceNotConfigured?: boolean;
  onNavigateVoiceSettings?: () => void;
  whisperDownload?: DownloadStatus;
  onWhisperDownload?: () => void;
};

export const ChatComposer = React.forwardRef<ChatComposerRef, ChatComposerProps>(
  function ChatComposer(
    {
      value,
      onChange,
      attachments,
      onAttachmentsChange,
      onSend,
      disabled = false,
      streaming = false,
      onStop,
      sendLabel = "Send",
      sendingLabel = "Sending...",
      stopLabel = "Stop",
      placeholder = "Assign me a task or ask anything...",
      maxAttachments = MAX_ATTACHMENTS_DEFAULT,
      onAttachmentsLimitError,
      isVoiceRecording = false,
      isVoiceProcessing = false,
      onVoiceStart,
      onVoiceStop,
      voiceNotConfigured = false,
      whisperDownload,
      onWhisperDownload,
    },
    ref
  ) {
    const fileInputRef = React.useRef<HTMLInputElement | null>(null);
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    const [showMicTooltip, setShowMicTooltip] = React.useState(false);
    const micTooltipRef = React.useRef<HTMLDivElement | null>(null);

    const refocusTextarea = React.useCallback(() => {
      textareaRef.current?.focus();
    }, []);

    const { onFileChange, removeAttachment, onDrop, onDragOver } = useFileAttachments({
      attachments,
      maxAttachments,
      onAttachmentsChange,
      onAttachmentsLimitError,
      onFilesAdded: refocusTextarea,
    });

    React.useEffect(() => {
      if (!isVoiceRecording || voiceNotConfigured) return;
      const handleGlobalMouseUp = () => onVoiceStop?.();
      window.addEventListener("mouseup", handleGlobalMouseUp);
      return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
    }, [isVoiceRecording, voiceNotConfigured, onVoiceStop]);

    const prevDownloadKindRef = React.useRef(whisperDownload?.kind);
    React.useEffect(() => {
      const prev = prevDownloadKindRef.current;
      prevDownloadKindRef.current = whisperDownload?.kind;
      if (prev === "downloading" && whisperDownload?.kind === "idle") {
        setShowMicTooltip(false);
      }
    }, [whisperDownload?.kind]);

    React.useEffect(() => {
      if (!showMicTooltip) return;
      const handle = (e: MouseEvent) => {
        if (micTooltipRef.current && !micTooltipRef.current.contains(e.target as Node)) {
          setShowMicTooltip(false);
        }
      };
      document.addEventListener("mousedown", handle);
      return () => document.removeEventListener("mousedown", handle);
    }, [showMicTooltip]);

    React.useImperativeHandle(ref, () => ({
      focusInput() {
        textareaRef.current?.focus();
      },
    }));

    React.useEffect(() => {
      const handler = () => textareaRef.current?.focus();
      document.addEventListener("refocus-chat-input", handler);
      return () => document.removeEventListener("refocus-chat-input", handler);
    }, []);

    const MIN_INPUT_HEIGHT = 28;
    const MAX_INPUT_HEIGHT = 180;

    const adjustTextareaHeight = React.useCallback(() => {
      const el = textareaRef.current;
      if (!el) {
        return;
      }
      el.style.height = "0";
      const next = Math.min(Math.max(el.scrollHeight, MIN_INPUT_HEIGHT), MAX_INPUT_HEIGHT);
      el.style.height = `${next}px`;
    }, []);

    React.useLayoutEffect(() => {
      adjustTextareaHeight();
    }, [value, adjustTextareaHeight]);

    const canSend = value.trim().length > 0;

    return (
      <div
        className={s.UiChatComposer}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
      >
        <div className={s.UiChatComposerInner}>
          {attachments.length > 0 && (
            <div className={s.UiChatAttachments}>
              {attachments.map((att) => {
                const isImage = att.mimeType.startsWith("image/");
                if (isImage) {
                  return (
                    <div key={att.id} className={s.UiChatAttachment}>
                      <img src={att.dataUrl} alt="" className={s.UiChatAttachmentImg} />
                      <button
                        type="button"
                        className={s.UiChatAttachmentRemove}
                        onClick={() => removeAttachment(att.id)}
                        aria-label="Remove attachment"
                      >
                        ×
                      </button>
                    </div>
                  );
                }
                return (
                  <ChatAttachmentCard
                    key={att.id}
                    fileName={att.fileName ?? getFileTypeLabel(att.mimeType)}
                    mimeType={att.mimeType}
                    onRemove={() => removeAttachment(att.id)}
                  />
                );
              })}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="*"
            multiple
            className={s.UiChatFileInput}
            aria-hidden
            onChange={onFileChange}
          />

          <textarea
            ref={textareaRef}
            className={s.UiChatInput}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text/plain");
              if (!text || !/\n+$/.test(text)) {
                return;
              }
              e.preventDefault();
              const trimmed = text.replace(/\n+$/, "");
              const target = e.currentTarget;
              const start = target.selectionStart ?? target.value.length;
              const end = target.selectionEnd ?? target.value.length;
              const next = target.value.slice(0, start) + trimmed + target.value.slice(end);
              onChange(next);
              requestAnimationFrame(() => {
                const el = textareaRef.current;
                if (!el) return;
                const caret = start + trimmed.length;
                el.setSelectionRange(caret, caret);
              });
            }}
          />

          <div className={s.UiChatComposerButtonBlock}>
            <button
              type="button"
              className={s.UiChatAttachButton}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach file"
              title="Attach file or image"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
              >
                <path
                  d="M9.00012 3.1499V14.8499M14.8501 8.9999H3.15012"
                  stroke="currentColor"
                  strokeWidth="1.503"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <div className={s.UiChatComposerButtonGroup}>
              {onVoiceStart && (
                <div className={s.UiChatMicWrap} ref={micTooltipRef}>
                  <button
                    type="button"
                    className={`${s.UiChatMicButton}${isVoiceRecording ? ` ${s["UiChatMicButton--recording"]}` : ""}${isVoiceProcessing ? ` ${s["UiChatMicButton--processing"]}` : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (voiceNotConfigured) {
                        setShowMicTooltip((v) => !v);
                        return;
                      }
                      if (!isVoiceRecording && !isVoiceProcessing) {
                        onVoiceStart();
                      }
                    }}
                    disabled={disabled || isVoiceProcessing}
                    aria-label={
                      voiceNotConfigured
                        ? "Voice not configured"
                        : isVoiceRecording
                          ? "Release to stop recording"
                          : isVoiceProcessing
                            ? "Transcribing..."
                            : "Hold to record voice"
                    }
                    title={
                      voiceNotConfigured
                        ? "Voice not configured"
                        : isVoiceRecording
                          ? "Release to stop"
                          : isVoiceProcessing
                            ? "Transcribing..."
                            : "Hold to record"
                    }
                  >
                    <MicrophoneIcon />
                  </button>
                  {showMicTooltip && (
                    <WhisperDownloadTooltip
                      whisperDownload={whisperDownload}
                      onWhisperDownload={onWhisperDownload}
                    />
                  )}
                </div>
              )}

              {streaming && onStop ? (
                <button
                  type="button"
                  className={`${s.UiChatSendButton} ${s.UiChatStopButton}`}
                  onClick={onStop}
                  aria-label={stopLabel}
                  title={stopLabel}
                >
                  <div className={s.UiChatStopButtonInner} />
                </button>
              ) : (
                <button
                  type="button"
                  className={s.UiChatSendButton}
                  onClick={onSend}
                  disabled={disabled || !canSend}
                  aria-label={disabled ? sendingLabel : sendLabel}
                  title={disabled ? sendingLabel : sendLabel}
                >
                  <SendIcon />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
);
