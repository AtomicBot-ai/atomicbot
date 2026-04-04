/**
 * Status bar and helpers extracted from AccountModelsTab.
 * @deprecated Part of the legacy AccountModels tab — scheduled for removal.
 */
import React from "react";
import { addToast, addToastError } from "@shared/toast";
import { openExternal } from "@shared/utils/openExternal";
import { LLAMACPP_LOCAL_BASE_URL } from "@main/constants";
import s from "./AccountModelsTab.module.css";

export const SERVER_STATUS_LABELS: Record<string, string> = {
  stopped: "Stopped",
  starting: "Starting…",
  loading: "Loading model…",
  running: "Running",
  error: "Error",
};

/** OpenAI-compatible base URL for bundled llama.cpp (matches default local provider `baseUrl`). */
export const LOCAL_MODELS_API_ENDPOINT = `${LLAMACPP_LOCAL_BASE_URL}/v1`;

export const LLAMACPP_PRIMARY_PREFIX = "llamacpp/";

/** Readable label when the catalog entry is not loaded yet (`provider/modelId`). */
export function formatModelIdForStatusBar(rawId: string): string {
  const t = rawId.trim();
  const i = t.indexOf("/");
  if (i >= 0 && i < t.length - 1) {
    return t.slice(i + 1);
  }
  return t;
}

export type StatusBarProps = {
  isLocalModels: boolean;
  modeLabel: string;
  modelName: string | null;
  serverStatus: string;
};

export function AccountModelsStatusBar({
  isLocalModels,
  modeLabel,
  modelName,
  serverStatus,
}: StatusBarProps) {
  const copyLocalApiEndpoint = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(LOCAL_MODELS_API_ENDPOINT);
      addToast("Copied to clipboard");
    } catch (err) {
      addToastError(err);
    }
  }, []);

  if (isLocalModels) {
    return (
      <div className={`${s.statusBar} ${s.statusBarHorizontal}`}>
        <div className={s.statusBarHorizontalMain}>
          <div className={s.statusSegment}>
            <span className={s.statusLabel}>Mode</span>
            <span className={s.statusValue}>
              <span className={s.statusValueText}>{modeLabel}</span>
            </span>
          </div>
          <div className={s.statusSegment}>
            <span className={s.statusLabel}>Model</span>
            <span className={s.statusValue}>
              <span className={s.statusValueText}>{modelName ?? "Not selected"}</span>
            </span>
          </div>
          <div className={s.statusSegment}>
            <span className={s.statusLabel}>Server</span>
            <span className={s.statusValue}>
              <span className={`${s.serverDot} ${s[`serverDot--${serverStatus}`] ?? ""}`} />
              <span className={s.statusValueText}>
                {SERVER_STATUS_LABELS[serverStatus] ?? serverStatus}
              </span>
            </span>
          </div>
          <div className={`${s.statusSegment} ${s.statusBarApiEndpoint}`}>
            <span className={s.statusLabel}>API Endpoint</span>
            <span className={s.statusValue}>
              <span className={s.apiEndpointRow}>
                <a
                  className={s.apiEndpointLink}
                  href={LOCAL_MODELS_API_ENDPOINT}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openExternal(LOCAL_MODELS_API_ENDPOINT);
                  }}
                >
                  {LOCAL_MODELS_API_ENDPOINT}
                </a>
                <button
                  type="button"
                  className={s.apiEndpointCopyBtn}
                  onClick={() => void copyLocalApiEndpoint()}
                  aria-label="Copy API endpoint URL"
                >
                  <ApiEndpointCopyIcon />
                </button>
              </span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${s.statusBar} ${s.statusBarVertical}`}>
      <div className={s.statusBarVerticalMain}>
        <div className={s.statusSegment}>
          <span className={s.statusLabel}>Mode</span>
          <span className={s.statusValue}>
            <span className={s.statusValueText}>{modeLabel}</span>
          </span>
        </div>
        <div className={s.statusSegment}>
          <span className={s.statusLabel}>Model</span>
          <span className={s.statusValue}>
            <span className={s.statusValueText}>{modelName ?? "Not selected"}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function ApiEndpointCopyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      fill="none"
      viewBox="0 0 16 16"
      aria-hidden
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M12 2.5H8A1.5 1.5 0 0 0 6.5 4v1H8a3 3 0 0 1 3 3v1.5h1A1.5 1.5 0 0 0 13.5 8V4A1.5 1.5 0 0 0 12 2.5M11 11h1a3 3 0 0 0 3-3V4a3 3 0 0 0-3-3H8a3 3 0 0 0-3 3v1H4a3 3 0 0 0-3 3v4a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3zM4 6.5h4A1.5 1.5 0 0 1 9.5 8v4A1.5 1.5 0 0 1 8 13.5H4A1.5 1.5 0 0 1 2.5 12V8A1.5 1.5 0 0 1 4 6.5"
        clipRule="evenodd"
      />
    </svg>
  );
}
