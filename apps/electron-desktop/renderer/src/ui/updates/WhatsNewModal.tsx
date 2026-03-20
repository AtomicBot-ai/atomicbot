import React from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { Modal } from "@shared/kit/Modal";
import { openExternal } from "@shared/utils/openExternal";
import s from "./WhatsNewModal.module.css";

const STORAGE_KEY = "whatsNew_lastVersion";
const LAUNCHED_KEY = "openclaw.desktop.launched";
const GITHUB_OWNER = "AtomicBot-ai";
const GITHUB_REPO = "atomicbot";

type WhatsNewState =
  | { kind: "idle" }
  | { kind: "loading"; version: string }
  | { kind: "ready"; version: string; body: string; htmlUrl: string }
  | { kind: "error" };

/**
 * Modal that appears once after the app has been updated to a new version.
 * It fetches release notes (markdown) from the corresponding GitHub release
 * via the main process (to avoid CSP restrictions in the renderer).
 */
export function WhatsNewModal() {
  const [state, setState] = React.useState<WhatsNewState>({ kind: "idle" });
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function check() {
      const api = getDesktopApiOrNull();
      if (!api?.getAppVersion) {
        return;
      }

      const { version } = await api.getAppVersion();

      const lastVersion = localStorage.getItem(STORAGE_KEY);

      // No stored version yet — either a fresh install or an upgrade from a
      // pre-WhatsNew build.  Check if the app has been launched before:
      // if the launched marker exists, the user is upgrading and should see the
      // modal; otherwise it's a genuinely first launch.
      const hasLaunchedBefore = localStorage.getItem(LAUNCHED_KEY) === "1";
      localStorage.setItem(LAUNCHED_KEY, "1");

      if (!lastVersion) {
        if (!hasLaunchedBefore) {
          // Truly first launch — record version silently.
          localStorage.setItem(STORAGE_KEY, version);
          return;
        }
        // Existing user upgrading from pre-WhatsNew build — fall through to
        // show the modal (lastVersion is treated as "older than current").
      }

      // Same version — nothing to show.
      if (lastVersion === version) {
        return;
      }

      // New version detected after an update.
      if (cancelled) {
        return;
      }
      setState({ kind: "loading", version });
      setOpen(true);

      // Fetch release notes via main process IPC (avoids renderer CSP).
      const notes = await api.fetchReleaseNotes(version, GITHUB_OWNER, GITHUB_REPO);
      if (cancelled) {
        return;
      }

      if (notes.ok && notes.body) {
        setState({ kind: "ready", version, body: notes.body, htmlUrl: notes.htmlUrl });
      } else {
        // Still show the modal even without notes — just acknowledge the update.
        setState({ kind: "ready", version, body: "", htmlUrl: "" });
      }

      // Record that we've seen this version.
      localStorage.setItem(STORAGE_KEY, version);
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClose = () => setOpen(false);

  const handleOpenChangelog = () => {
    if (state.kind === "ready" && state.htmlUrl) {
      openExternal(state.htmlUrl);
    }
  };

  if (!open || state.kind === "idle") {
    return null;
  }

  const version =
    state.kind === "loading" ? state.version : state.kind === "ready" ? state.version : "";

  return (
    <Modal open={open} onClose={handleClose} aria-label="What's new">
      <div className={s.WhatsNew}>
        <div className={s["WhatsNew-header"]}>
          <h2 className={s["WhatsNew-title"]}>Version {version} has been released</h2>
        </div>

        <div className={s["WhatsNew-subheader"]}>
          <span className={s["WhatsNew-label"]}>What&apos;s new</span>
          {state.kind === "ready" && state.htmlUrl && (
            <button
              className={s["WhatsNew-changelogLink"]}
              type="button"
              onClick={handleOpenChangelog}
            >
              Open the changelog on GitHub
            </button>
          )}
        </div>

        <div className={s["WhatsNew-body"]}>
          {state.kind === "loading" && (
            <div className={s["WhatsNew-loading"]}>
              <span className="UiButtonSpinner" aria-hidden="true" />
              <span>Loading release notes…</span>
            </div>
          )}

          {state.kind === "ready" && state.body && (
            <div className="UiMarkdown">
              <Markdown remarkPlugins={[remarkGfm]}>{state.body}</Markdown>
            </div>
          )}

          {state.kind === "ready" && !state.body && (
            <p className={s["WhatsNew-empty"]}>
              The app has been updated. Check the changelog for details.
            </p>
          )}
        </div>

        <div className={s["WhatsNew-footer"]}>
          <button className={s["WhatsNew-gotIt"]} type="button" onClick={handleClose}>
            Got it
          </button>
        </div>
      </div>
    </Modal>
  );
}
