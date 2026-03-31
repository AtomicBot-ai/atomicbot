import React from "react";

import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  cancelLlamacppBackendDownload,
  cancelLlamacppModelDownload,
} from "@store/slices/llamacppSlice";
import s from "./UpdateBanner.module.css";

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 2v8.5m0 0L4.5 7m3.5 3.5L11.5 7M3 13h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Floating banner (reuses UpdateBanner visuals) that appears when
 * llamacpp backend or model download is in progress.
 * Positioned below the UpdateBanner to avoid overlap.
 */
export function LlamacppDownloadBanner() {
  const dispatch = useAppDispatch();
  const backendDownload = useAppSelector((st) => st.llamacpp.backendDownload);
  const modelDownload = useAppSelector((st) => st.llamacpp.modelDownload);

  const isBackendDownloading = backendDownload.kind === "downloading";
  const isModelDownloading = modelDownload.kind === "downloading";

  const handleCancel = React.useCallback(() => {
    if (isModelDownloading) {
      void dispatch(cancelLlamacppModelDownload());
    } else if (isBackendDownloading) {
      void dispatch(cancelLlamacppBackendDownload());
    }
  }, [dispatch, isBackendDownloading, isModelDownloading]);

  if (!isBackendDownloading && !isModelDownloading) {
    return null;
  }

  const label = isModelDownloading ? "Downloading model…" : "Downloading AI engine…";
  const percent = isModelDownloading
    ? modelDownload.percent
    : isBackendDownloading
      ? backendDownload.percent
      : 0;

  return (
    <div
      className={`${s.UpdateBanner} ${s["UpdateBanner--right"]} ${s["UpdateBanner--inStack"]}`}
      role="status"
      aria-live="polite"
    >
      <div className={s["UpdateBanner-icon"]}>
        <DownloadIcon />
      </div>

      <div className={s["UpdateBanner-body"]}>
        <span className={s["UpdateBanner-text"]}>{label}</span>
        <div className={s["UpdateBanner-progress"]}>
          <div className={s["UpdateBanner-progressBar"]} style={{ width: `${percent}%` }} />
        </div>
      </div>

      <span className={s["UpdateBanner-percent"]}>{percent}%</span>

      <button
        type="button"
        className={`${s["UpdateBanner-btn"]} ${s["UpdateBanner-btn--dismiss"]}`}
        onClick={handleCancel}
        aria-label="Cancel download"
      >
        &times;
      </button>
    </div>
  );
}
