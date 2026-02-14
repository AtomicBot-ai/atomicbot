import React, { useState } from "react";
import { CopyIcon, CheckIcon } from "../shared/kit/icons";

/** Copy button with local state so only this message's icon toggles on copy. */
export function CopyMessageButton({ text }: { text: string }) {
  const [isCopied, setIsCopied] = useState(false);
  return (
    <button
      type="button"
      className="UiChatMessageActionBtn"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 1500);
      }}
      aria-label={isCopied ? "Copied" : "Copy"}
    >
      {isCopied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}
