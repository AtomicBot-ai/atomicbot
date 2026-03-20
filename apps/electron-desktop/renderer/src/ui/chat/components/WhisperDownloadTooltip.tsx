import type { DownloadStatus } from "@store/slices/whisperSlice";
import s from "./ChatComposer.module.css";

export function WhisperDownloadTooltip({
  whisperDownload,
  onWhisperDownload,
}: {
  whisperDownload?: DownloadStatus;
  onWhisperDownload?: () => void;
}) {
  if (whisperDownload?.kind === "downloading") {
    return (
      <div className={s.UiChatMicTooltip}>
        <div className={s.UiChatMicTooltipText}>
          Downloading Whisper… {whisperDownload.percent}%
        </div>
        <div className={s.UiChatMicTooltipProgress}>
          <div
            className={s.UiChatMicTooltipProgressBar}
            style={{ width: `${whisperDownload.percent}%` }}
          />
        </div>
      </div>
    );
  }

  if (whisperDownload?.kind === "error") {
    return (
      <div className={s.UiChatMicTooltip}>
        <div className={s.UiChatMicTooltipText}>Download failed: {whisperDownload.message}</div>
        <button
          type="button"
          className={s.UiChatMicTooltipLink}
          onClick={() => onWhisperDownload?.()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={s.UiChatMicTooltip}>
      <div className={s.UiChatMicTooltipText}>Download the Whisper model to use voice input.</div>
      <button
        type="button"
        className={s.UiChatMicTooltipLink}
        onClick={() => onWhisperDownload?.()}
      >
        Download
      </button>
    </div>
  );
}
