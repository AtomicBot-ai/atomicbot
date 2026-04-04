import React from "react";

import sm from "./SkillModal.module.css";
import { DESKTOP_API_UNAVAILABLE, getDesktopApiOrNull } from "@ipc/desktopApi";
import { ActionButton, TextInput } from "@shared/kit";
import { errorToMessage } from "@shared/toast";
import { openExternal } from "@shared/utils/openExternal";
import { useGogCredentialsForm } from "./useGogCredentialsForm";
import { useGogConnectedAccounts } from "./useGogConnectedAccounts";

const DEFAULT_GOG_SERVICES = "gmail,calendar,drive,docs,sheets,contacts";
const GOOGLE_CLOUD_CONSOLE_URL = "https://console.cloud.google.com/apis/credentials";
const GOOGLE_CLOUD_NEW_PROJECT_URL = "https://console.cloud.google.com/projectcreate";
const GOOGLE_CLOUD_OAUTH_CONSENT_URL =
  "https://console.cloud.google.com/apis/credentials/consent";
const GOOGLE_CLOUD_ENABLE_APIS_URL = "https://console.cloud.google.com/apis/library";

type GogExecResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
};

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="UiLink"
      onClick={(e) => {
        e.preventDefault();
        openExternal(href);
      }}
    >
      {children}
    </a>
  );
}

export function GoogleWorkspaceModalContent(props: {
  isConnected: boolean;
  onConnected: () => void;
  onDisabled: () => void;
}) {
  const [account, setAccount] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [errorText, setErrorText] = React.useState("");
  const [showConnectForm, setShowConnectForm] = React.useState(!props.isConnected);

  const credentials = useGogCredentialsForm(props.isConnected);
  const { connectedEmails } = useGogConnectedAccounts(props.isConnected);

  const runGog = React.useCallback(async (fn: () => Promise<GogExecResult>) => {
    setError(undefined);
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.stderr?.trim() || "Google Workspace connection failed");
      }
      return res;
    } catch (err) {
      setError(errorToMessage(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const handleConnect = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    if (!api) {
      setError(DESKTOP_API_UNAVAILABLE);
      return;
    }
    try {
      const res = await runGog(() =>
        api.gogAuthAdd({ account: account.trim(), services: DEFAULT_GOG_SERVICES })
      );
      if (res.ok) {
        props.onConnected();
      }
    } catch {
      // Error already set by runGog.
    }
  }, [account, props, runGog]);

  const handleCheck = React.useCallback(async () => {
    if (errorText) {
      setErrorText("");
    }

    const trimmed = account.trim();
    if (!trimmed) {
      setErrorText("Please enter your email to continue");
      return;
    }

    const api = getDesktopApiOrNull();
    if (!api) {
      setError(DESKTOP_API_UNAVAILABLE);
      return;
    }
    try {
      await runGog(() => api.gogAuthList());
    } catch {
      // Error already set by runGog.
    }
  }, [account, errorText, runGog]);

  return (
    <div className={sm.UiSkillModalContent}>
      <div className="UiSectionSubtitle">
        Connects your Google account locally to enable email and calendar skills. Secrets are stored
        locally.
      </div>

      <details open={credentials.showCredentials || undefined}>
        <summary
          style={{ cursor: "pointer", fontSize: "13px", fontWeight: 600, marginTop: "12px" }}
          onClick={(e) => {
            e.preventDefault();
            credentials.toggleShowCredentials();
          }}
        >
          {credentials.credentialsSet ? "Update OAuth credentials" : "Set OAuth credentials"}
        </summary>
        <div style={{ marginTop: "8px" }}>
          <ol
            style={{
              color: "#ffffffb2",
              fontSize: "12px",
              lineHeight: "18px",
              margin: "0 0 10px",
              paddingLeft: "16px",
            }}
          >
            <li style={{ marginBottom: "4px" }}>
              Open the{" "}
              <ExternalLink href={GOOGLE_CLOUD_CONSOLE_URL}>
                Google Cloud Console ↗
              </ExternalLink>
              . If needed,{" "}
              <ExternalLink href={GOOGLE_CLOUD_NEW_PROJECT_URL}>
                create a project ↗
              </ExternalLink>
              .
            </li>
            <li style={{ marginBottom: "4px" }}>
              Enable required APIs (Gmail, Calendar, Drive, etc.) in the{" "}
              <ExternalLink href={GOOGLE_CLOUD_ENABLE_APIS_URL}>
                API Library ↗
              </ExternalLink>
              .
            </li>
            <li style={{ marginBottom: "4px" }}>
              Configure the{" "}
              <ExternalLink href={GOOGLE_CLOUD_OAUTH_CONSENT_URL}>
                OAuth consent screen ↗
              </ExternalLink>{" "}
              (External, fill in app name and email).
            </li>
            <li style={{ marginBottom: "4px" }}>
              Go to{" "}
              <ExternalLink href={GOOGLE_CLOUD_CONSOLE_URL}>
                Credentials ↗
              </ExternalLink>{" "}
              {"→"} <strong>Create Credentials</strong> {"→"}{" "}
              <strong>OAuth client ID</strong> (Desktop app).
            </li>
            <li>
              Click <strong>Download JSON</strong> and paste it below or use the file picker.
            </li>
          </ol>
          <textarea
            className="UiTextarea"
            value={credentials.credentialsJson}
            onChange={(e) => credentials.setCredentialsJson(e.target.value)}
            placeholder="Paste your client_secret.json contents here..."
            rows={5}
            disabled={credentials.credentialsBusy}
            style={{
              width: "100%",
              boxSizing: "border-box",
              fontFamily: "monospace",
              fontSize: "12px",
              resize: "vertical",
              background: "rgba(0,0,0,0.2)",
              border: "1px solid #ffffff14",
              borderRadius: "var(--radius-14)",
              padding: "10px 12px",
              color: "inherit",
            }}
          />
          <input
            ref={credentials.fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={(e) => void credentials.handleFilePick(e)}
          />
          {credentials.credentialsError && (
            <div className="UiErrorText" style={{ marginTop: "4px" }}>
              {credentials.credentialsError}
            </div>
          )}
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <ActionButton disabled={credentials.credentialsBusy} onClick={() => credentials.fileInputRef.current?.click()}>
              Choose File
            </ActionButton>
            <ActionButton
              variant="primary"
              disabled={credentials.credentialsBusy || !credentials.credentialsJson.trim()}
              onClick={() => void credentials.handleSetCredentials()}
            >
              {credentials.credentialsBusy ? "Setting..." : "Set Credentials"}
            </ActionButton>
          </div>
        </div>
      </details>

      {props.isConnected && connectedEmails.length > 0 && (
        <div style={{ marginTop: "8px" }}>
          <label className={sm.UiSkillModalLabel}>Connected account</label>
          <div
            style={{
              marginTop: "6px",
              padding: "8px 12px",
              background: "rgba(0,0,0,0.2)",
              border: "1px solid #ffffff14",
              borderRadius: "var(--radius-10)",
              fontSize: "13px",
              color: "rgba(230, 237, 243, 0.88)",
            }}
          >
            {connectedEmails.join(", ")}
          </div>
        </div>
      )}

      {credentials.credentialsSet && !showConnectForm && props.isConnected && (
        <div style={{ marginTop: "8px" }}>
          <ActionButton onClick={() => setShowConnectForm(true)}>
            Setup another email
          </ActionButton>
        </div>
      )}

      {credentials.credentialsSet && showConnectForm && (
        <div className={sm.UiSkillModalField} style={{ marginTop: "16px" }}>
          <label className={sm.UiSkillModalLabel}>Google account email</label>
          <TextInput
            type="text"
            value={account}
            onChange={setAccount}
            placeholder="you@gmail.com"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            isError={error}
          />
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <ActionButton variant="primary" disabled={busy} onClick={() => void handleConnect()}>
              {busy ? "Connecting..." : "Connect"}
            </ActionButton>
          </div>
        </div>
      )}

      {props.isConnected && (
        <div className={sm.UiSkillModalDangerZone}>
          <button
            type="button"
            className={sm.UiSkillModalDisableButton}
            disabled={busy}
            onClick={props.onDisabled}
          >
            Disable
          </button>
        </div>
      )}
    </div>
  );
}
