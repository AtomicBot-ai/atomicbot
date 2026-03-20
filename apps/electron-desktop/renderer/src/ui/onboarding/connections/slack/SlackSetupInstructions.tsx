import { openExternal } from "@shared/utils/openExternal";
import gw from "../GoogleWorkspace.module.css";

/** Collapsible step-by-step instructions for Slack onboarding. */
export function SlackSetupInstructions() {
  return (
    <>
      <div className="UiSectionSubtitle">
        Steps:
        <ol>
          <li>Slack API → Create App (From scratch).</li>
          <li>Enable Socket Mode and create an app token (starts with xapp-).</li>
          <li>Install the app to your workspace to get a bot token (starts with xoxb-).</li>
          <li>Invite the bot to channels you want it to read.</li>
        </ol>
        Docs:{" "}
        <a
          href="https://docs.openclaw.ai/slack"
          target="_blank"
          rel="noopener noreferrer"
          className="UiLink"
          onClick={(e) => {
            e.preventDefault();
            openExternal("https://docs.openclaw.ai/slack");
          }}
        >
          Slack setup ↗
        </a>
      </div>

      <details className={gw.details} style={{ marginTop: 14, marginBottom: 14 }}>
        <summary className={gw.detailsSummary}>Where to find the tokens</summary>
        <div className="UiSectionSubtitle" style={{ marginTop: 10 }}>
          <ol>
            <li>
              <div>
                Create a Slack app: Slack API → <strong>Apps</strong> →{" "}
                <strong>Create New App</strong> → <strong>From scratch</strong>.
              </div>
            </li>
            <li>
              <div>
                Enable Socket Mode: <strong>Socket Mode</strong> → toggle on.
              </div>
            </li>
            <li>
              <div>
                Create the app token (xapp-...): <strong>Basic Information</strong> →{" "}
                <strong>App-Level Tokens</strong> → <strong>Generate Token and Scopes</strong> →
                scope connections:write.
              </div>
            </li>
            <li>
              <div>
                Create the bot token (xoxb-...): <strong>OAuth &amp; Permissions</strong> → add bot
                scopes (use the Manifest below) → <strong>Install to Workspace</strong> → copy{" "}
                <strong>Bot User OAuth Token</strong>.
              </div>
            </li>
            <li>
              Invite the bot to channels you want it to read (for example, in Slack: /invite
              @YourBot).
            </li>
          </ol>
          Notes:
          <ul>
            <li>
              <div>
                The <strong>Client Secret</strong> and <strong>Signing Secret</strong> shown in
                Slack <strong>Basic Information</strong> are <em>not</em> the tokens used for Socket
                Mode in OpenClaw.
              </div>
            </li>
            <li>
              If you previously pasted secrets anywhere public, rotate them in Slack (Regenerate)
              and use new tokens.
            </li>
          </ul>
        </div>
      </details>
    </>
  );
}
