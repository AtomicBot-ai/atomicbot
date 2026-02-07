import React from "react";

type UpdatePhase =
  | { kind: "idle" }
  | { kind: "available"; version: string }
  | { kind: "downloading"; percent: number }
  | { kind: "ready"; version: string }
  | { kind: "error"; message: string };

/**
 * Floating banner that shows when an app update is available, downloading, or ready to install.
 * Subscribes to updater events from the main process via the preload bridge.
 */
export function UpdateBanner() {
  const [phase, setPhase] = React.useState<UpdatePhase>({ kind: "idle" });
  const [dismissed, setDismissed] = React.useState(false);

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
      })
    );

    unsubs.push(
      api.onUpdateDownloadProgress((payload) => {
        setPhase({ kind: "downloading", percent: Math.round(payload.percent) });
      })
    );

    unsubs.push(
      api.onUpdateDownloaded((payload) => {
        setPhase({ kind: "ready", version: payload.version });
        setDismissed(false);
      })
    );

    unsubs.push(
      api.onUpdateError((payload) => {
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

  return (
    <div className="UpdateBanner" role="status" aria-live="polite">
      {phase.kind === "available" && (
        <>
          <span className="UpdateBanner-text">
            Update available: <strong>v{phase.version}</strong>
          </span>
          <button
            className="UpdateBanner-btn UpdateBanner-btn--primary"
            onClick={() => void window.openclawDesktop?.downloadUpdate()}
          >
            Download
          </button>
          <button
            className="UpdateBanner-btn UpdateBanner-btn--dismiss"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
          >
            &times;
          </button>
        </>
      )}

      {phase.kind === "downloading" && (
        <>
          <span className="UpdateBanner-text">Downloading update... {phase.percent}%</span>
          <div className="UpdateBanner-progress">
            <div
              className="UpdateBanner-progressBar"
              style={{ width: `${phase.percent}%` }}
            />
          </div>
        </>
      )}

      {phase.kind === "ready" && (
        <>
          <span className="UpdateBanner-text">
            Update <strong>v{phase.version}</strong> ready!
          </span>
          <button
            className="UpdateBanner-btn UpdateBanner-btn--primary"
            onClick={() => void window.openclawDesktop?.installUpdate()}
          >
            Restart &amp; Update
          </button>
          <button
            className="UpdateBanner-btn UpdateBanner-btn--dismiss"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
          >
            &times;
          </button>
        </>
      )}

      {phase.kind === "error" && (
        <>
          <span className="UpdateBanner-text UpdateBanner-text--error">
            Update failed: {phase.message}
          </span>
          <button
            className="UpdateBanner-btn UpdateBanner-btn--dismiss"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
          >
            &times;
          </button>
        </>
      )}
    </div>
  );
}
