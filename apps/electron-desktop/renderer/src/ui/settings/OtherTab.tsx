import React from "react";
import { NavLink } from "react-router-dom";
import { routes } from "../routes";
import "./OtherTab.css";
import pkg from "../../../../package.json";

export function OtherTab({ onError }: { onError: (msg: string | null) => void }) {
  const [launchAtStartup, setLaunchAtStartup] = React.useState(false);
  const [resetBusy, setResetBusy] = React.useState(false);

  const appVersion = pkg.version || "0.0.0";

  // Load the current launch-at-login state on mount.
  React.useEffect(() => {
    const api = window.openclawDesktop;
    if (!api?.getLaunchAtLogin) {return;}
    void api.getLaunchAtLogin().then((res) => setLaunchAtStartup(res.enabled));
  }, []);

  const toggleLaunchAtStartup = React.useCallback(
    async (enabled: boolean) => {
      const api = window.openclawDesktop;
      if (!api?.setLaunchAtLogin) {
        onError("Desktop API not available");
        return;
      }
      setLaunchAtStartup(enabled);
      try {
        await api.setLaunchAtLogin(enabled);
      } catch (err) {
        // Revert on failure.
        setLaunchAtStartup(!enabled);
        onError(String(err));
      }
    },
    [onError]
  );

  const resetAndClose = React.useCallback(async () => {
    const api = window.openclawDesktop;
    if (!api) {
      onError("Desktop API not available");
      return;
    }
    const ok = window.confirm(
      "All local data will be deleted and Google Workspace will be disconnected. The app will close and you’ll need to set it up again."
    );
    if (!ok) {return;}
    onError(null);
    setResetBusy(true);
    try {
      await api.resetAndClose();
    } catch (err) {
      onError(String(err));
      setResetBusy(false);
    }
  }, [onError]);

  const api = window.openclawDesktop;

  return (
    <div className="UiSettingsContentInner UiSettingsOther">
      <h2 className="UiSettingsOtherTitle">Other</h2>

      {/* Agent workspace folder */}
      <section className="UiSettingsOtherSection">
        <h3 className="UiSettingsOtherSectionTitle">Workspace</h3>
        <div className="UiSettingsOtherCard">
          <div className="UiSettingsOtherRow">
            <span className="UiSettingsOtherRowLabel">Agent workspace</span>
            <button
              type="button"
              className="UiSettingsOtherLink"
              onClick={() => void api?.openWorkspaceFolder()}
            >
              Open folder
            </button>
          </div>
        </div>
        <p className="UiSettingsOtherHint">
          The workspace contains markdown files that define how the agent works: AGENTS.md
          (instructions), SOUL.md (personality and style), USER.md (info about you), IDENTITY.md
          (name, emoji, avatar), TOOLS.md (tool notes), HEARTBEAT.md (heartbeat checks), and
          BOOTSTRAP.md (initial setup, safe to delete after first conversation). You can edit them
          manually in any text editor.
        </p>
      </section>

      {/* About */}
      <section className="UiSettingsOtherSection">
        <h3 className="UiSettingsOtherSectionTitle">App</h3>
        <div className="UiSettingsOtherCard">
          <div className="UiSettingsOtherRow">
            <span className="UiSettingsOtherRowLabel">Version</span>
            <span className="UiSettingsOtherAppRowValue">Atomic Bot v{appVersion}</span>
          </div>

          <div className="UiSettingsOtherRow">
            <span className="UiSettingsOtherRowLabel">Auto start</span>
            <span className="UiSettingsOtherAppRowValue">
              <label className="UiSettingsOtherToggle" aria-label="Launch at startup">
                <input
                  type="checkbox"
                  checked={launchAtStartup}
                  onChange={(e) => void toggleLaunchAtStartup(e.target.checked)}
                />
                <span className="UiSettingsOtherToggleTrack">
                  <span className="UiSettingsOtherToggleThumb" />
                </span>
              </label>
            </span>
          </div>

          {/*<>*/}
          {/*  <div className="UiSettingsOtherRow">*/}
          {/*    <button*/}
          {/*      type="button"*/}
          {/*      className="UiSettingsOtherLink"*/}
          {/*      onClick={() => void api?.openLogs()}*/}
          {/*    >*/}
          {/*      Open logs*/}
          {/*    </button>*/}
          {/*  </div>*/}
          {/*  <div className="UiSettingsOtherRow">*/}
          {/*    <button*/}
          {/*      type="button"*/}
          {/*      className="UiSettingsOtherLink"*/}
          {/*      onClick={() => void api?.toggleDevTools()}*/}
          {/*    >*/}
          {/*      Dev Tools*/}
          {/*    </button>*/}
          {/*  </div>*/}
          {/*</>*/}

          <div className="UiSettingsOtherRow">
            <span className="UiSettingsOtherRowLabel">License</span>
            <button
              type="button"
              className="UiSettingsOtherLink"
              onClick={() =>
                void api?.openExternal("https://polyformproject.org/licenses/noncommercial/1.0.0")
              }
            >
              PolyForm Noncommercial 1.0.0
            </button>
          </div>

          <div className="UiSettingsOtherRow">
            <NavLink to={routes.legacy} className="UiSettingsOtherLink">
              Legacy
            </NavLink>
          </div>
        </div>
      </section>

      {/* About */}
      <section className="UiSettingsOtherSection">
        <h3 className="UiSettingsOtherSectionTitle">About</h3>
        <div className="UiSettingsOtherCard">
          <div className="UiSettingsOtherRow">
            <span className="UiSettingsOtherRowLabel">
              &copy; {new Date().getFullYear()} Atomic Bot
            </span>
          </div>
          <div className="UiSettingsOtherRow">
            <span className="UiSettingsOtherRowLabel">Support</span>
            <a href="mailto:support@atomicbot.ai" className="UiSettingsOtherLink">
              support@atomicbot.ai
            </a>
          </div>
          <div className="UiSettingsOtherRow">
            <button
              type="button"
              className="UiSettingsOtherLink"
              onClick={() => void api?.openExternal("https://github.com/AtomicBot-ai/atomicbot")}
            >
              GitHub
            </button>
          </div>
          <div className="UiSettingsOtherRow">
            <button
              type="button"
              className="UiSettingsOtherLink"
              onClick={() => void api?.openExternal("https://atomicbot.ai")}
            >
              Website
            </button>
          </div>
          <div className="UiSettingsOtherRow">
            <button
              type="button"
              className="UiSettingsOtherLink"
              onClick={() => void api?.openExternal("https://x.com/atomicbot_ai")}
            >
              X (Twitter)
            </button>
          </div>
          <div className="UiSettingsOtherRow">
            <button
              type="button"
              className="UiSettingsOtherLink"
              onClick={() => void api?.openExternal("https://www.instagram.com/atomicbot.ai/")}
            >
              Instagram
            </button>
          </div>
          <div className="UiSettingsOtherRow">
            <button
              type="button"
              className="UiSettingsOtherLink"
              onClick={() => void api?.openExternal("https://discord.gg/2TXafRV69m")}
            >
              Discord
            </button>
          </div>
        </div>
      </section>

      {/* Danger zone (reset) */}
      <section className="UiSettingsOtherSection">
        <h3 className="UiSettingsOtherSectionTitle">Account</h3>
        <h3 className="UiSettingsOtherDangerSubtitle">
          This will wipe the app's local state and remove all Google Workspace authorizations. The
          app will restart.
        </h3>
        <div className="UiSettingsOtherCard UiSettingsOtherCard--danger">
          <div className="UiSettingsOtherRow">
            <button
              type="button"
              className="UiSettingsOtherDangerButton"
              disabled={resetBusy}
              onClick={() => void resetAndClose()}
            >
              {resetBusy ? "Resetting..." : "Reset and sign out"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
