import React from "react";

type UpdatePhase =
  | { kind: "idle" }
  | { kind: "available"; version: string }
  | { kind: "downloading"; percent: number }
  | { kind: "ready"; version: string }
  | { kind: "error"; message: string };

/** Arrow-down icon for download state. */
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

/** Checkmark icon for ready state. */
function ReadyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3.5 8.5L6.5 11.5L12.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Warning icon for error state. */
function ErrorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 5.5v3M8 11h.007M3.072 13h9.856c1.072 0 1.744-1.16 1.208-2.084L9.208 3.084a1.396 1.396 0 00-2.416 0L1.864 10.916C1.328 11.84 2 13 3.072 13z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Floating banner that shows when an app update is available, downloading, or ready to install.
 * Subscribes to updater events from the main process via the preload bridge.
 */
/** Tiny CSS spinner rendered inline inside buttons. */
function BtnSpinner() {
  return <span className="UpdateBanner-spinner" />;
}

export function UpdateBanner() {
  const [phase, setPhase] = React.useState<UpdatePhase>({ kind: "idle" });
  const [dismissed, setDismissed] = React.useState(false);
  /** True after clicking Download, before the first download-progress event arrives. */
  const [startingDownload, setStartingDownload] = React.useState(false);
  /** True after clicking Restart & Update, until the app quits. */
  const [installing, setInstalling] = React.useState(false);

  React.useEffect(() => {
    const api = window.openclawDesktop;
    if (!api) {
      return;
    }

    const unsubs: Array<() => void> = [];

    unsubs.push(
      api.onUpdateAvailable((payload) => {
        setPhase({ kind: "available", version: payload.version });
        setDismissed(false);
        setStartingDownload(false);
      })
    );

    unsubs.push(
      api.onUpdateDownloadProgress((payload) => {
        // First progress event means download has truly started
        setStartingDownload(false);
        setPhase({ kind: "downloading", percent: Math.round(payload.percent) });
      })
    );

    unsubs.push(
      api.onUpdateDownloaded((payload) => {
        setPhase({ kind: "ready", version: payload.version });
        setDismissed(false);
        setStartingDownload(false);
      })
    );

    unsubs.push(
      api.onUpdateError((payload) => {
        setStartingDownload(false);
        setInstalling(false);
        // Only show error if we were in a downloading state; ignore background check errors.
        setPhase((prev) => {
          if (prev.kind === "downloading") {
            return { kind: "error", message: payload.message };
          }
          return prev;
        });
      })
    );

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, []);

  if (phase.kind === "idle" || dismissed) {
    return null;
  }

  const isError = phase.kind === "error";

  return (
    <div className="UpdateBanner" role="status" aria-live="polite">
      <div className={`UpdateBanner-icon${isError ? " UpdateBanner-icon--error" : ""}`}>
        {phase.kind === "available" && <DownloadIcon />}
        {phase.kind === "downloading" && <DownloadIcon />}
        {phase.kind === "ready" && <ReadyIcon />}
        {phase.kind === "error" && <ErrorIcon />}
      </div>

      {phase.kind === "available" && (
        <>
          <span className="UpdateBanner-text">
            Update available: <strong>v{phase.version}</strong>
          </span>
          <div className="UpdateBanner-actions">
            <button
              className="UpdateBanner-btn UpdateBanner-btn--primary"
              disabled={startingDownload}
              onClick={() => {
                setStartingDownload(true);
                void window.openclawDesktop?.downloadUpdate();
              }}
            >
              {startingDownload ? <BtnSpinner /> : "Download"}
            </button>
            <button
              className="UpdateBanner-btn UpdateBanner-btn--dismiss"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        </>
      )}

      {phase.kind === "downloading" && (
        <>
          <div className="UpdateBanner-body">
            <span className="UpdateBanner-text">Downloading update…</span>
            <div className="UpdateBanner-progress">
              <div className="UpdateBanner-progressBar" style={{ width: `${phase.percent}%` }} />
            </div>
          </div>
          <span className="UpdateBanner-percent">{phase.percent}%</span>
        </>
      )}

      {phase.kind === "ready" && (
        <>
          <span className="UpdateBanner-text">
            <strong>v{phase.version}</strong> ready to install
          </span>
          <div className="UpdateBanner-actions">
            <button
              className="UpdateBanner-btn UpdateBanner-btn--primary"
              disabled={installing}
              onClick={() => {
                setInstalling(true);
                void window.openclawDesktop?.installUpdate();
              }}
            >
              {installing ? <BtnSpinner /> : "Restart & Update"}
            </button>
            {!installing && (
              <button
                className="UpdateBanner-btn UpdateBanner-btn--dismiss"
                onClick={() => setDismissed(true)}
                aria-label="Dismiss"
              >
                &times;
              </button>
            )}
          </div>
        </>
      )}

      {phase.kind === "error" && (
        <>
          <span className="UpdateBanner-text UpdateBanner-text--error">
            Update failed: {phase.message}
          </span>
          <div className="UpdateBanner-actions">
            <button
              className="UpdateBanner-btn UpdateBanner-btn--dismiss"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        </>
      )}
    </div>
  );
}
