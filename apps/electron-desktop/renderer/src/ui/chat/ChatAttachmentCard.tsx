import React from "react";

/** Human-readable file type label from mimeType (exported for fallback display name). */
export function getFileTypeLabel(mimeType: string): string {
  if (mimeType === "application/pdf") {
    return "PDF File";
  }
  const [main] = mimeType.split("/");
  if (main === "image") {return "Image";}
  if (main === "audio") {return "Audio";}
  if (main === "video") {return "Video";}
  if (main === "text") {return "Text File";}
  return "File";
}

export type ChatAttachmentCardProps = {
  /** Display name (e.g. filename or fallback label). */
  fileName: string;
  mimeType: string;
  /** Show remove button and call on remove (composer only). */
  onRemove?: () => void;
};

/** File attachment card: icon + filename + file type (non-image). */
export function ChatAttachmentCard({ fileName, mimeType, onRemove }: ChatAttachmentCardProps) {
  const fileTypeLabel = getFileTypeLabel(mimeType);

  return (
    <div className="UiChatAttachmentCard">
      <div className="UiChatAttachmentCardIconBox" aria-hidden="true">
        <svg
          className="UiChatAttachmentCardIcon"
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 20 20"
          fill="none"
        >
          <path
            d="M11.6667 1.89128V5.3334C11.6667 5.80011 11.6667 6.03346 11.7575 6.21172C11.8374 6.36852 11.9649 6.49601 12.1217 6.5759C12.2999 6.66673 12.5333 6.66673 13 6.66673H16.4421M11.6667 14.1667H6.66666M13.3333 10.8333H6.66666M16.6667 8.32353V14.3333C16.6667 15.7335 16.6667 16.4335 16.3942 16.9683C16.1545 17.4387 15.772 17.8212 15.3016 18.0609C14.7669 18.3333 14.0668 18.3333 12.6667 18.3333H7.33333C5.9332 18.3333 5.23313 18.3333 4.69835 18.0609C4.22795 17.8212 3.8455 17.4387 3.60581 16.9683C3.33333 16.4335 3.33333 15.7335 3.33333 14.3333V5.66667C3.33333 4.26654 3.33333 3.56647 3.60581 3.0317C3.8455 2.56129 4.22795 2.17884 4.69835 1.93916C5.23313 1.66667 5.9332 1.66667 7.33333 1.66667H10.0098C10.6213 1.66667 10.927 1.66667 11.2147 1.73575C11.4698 1.79699 11.7137 1.898 11.9374 2.03507C12.1897 2.18968 12.4059 2.40587 12.8382 2.83824L15.4951 5.4951C15.9275 5.92748 16.1437 6.14367 16.2983 6.39596C16.4353 6.61964 16.5363 6.8635 16.5976 7.11859C16.6667 7.40631 16.6667 7.71205 16.6667 8.32353Z"
            stroke="currentColor"
            strokeWidth="1.66667"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="UiChatAttachmentCardText">
        <span className="UiChatAttachmentCardFileName">{fileName}</span>
        <span className="UiChatAttachmentCardFileType">{fileTypeLabel}</span>
      </div>
      {onRemove != null && (
        <button
          type="button"
          className="UiChatAttachmentCardRemove"
          onClick={onRemove}
          aria-label="Remove attachment"
        >
          ×
        </button>
      )}
    </div>
  );
}
