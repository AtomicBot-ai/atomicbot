import React from "react";

import sm from "./SkillModal.module.css";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { ActionButton, TextInput } from "@shared/kit";
import { errorToMessage } from "@shared/toast";
import connectGoogleImage from "@assets/connect-google.png";

const DEFAULT_GOG_SERVICES = "gmail,calendar,drive,docs,sheets,contacts";

type GogExecResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
};

export function GoogleWorkspaceModalContent(props: {
  isConnected: boolean;
  onConnected: () => void;
  onDisabled: () => void;
}) {
  const [account, setAccount] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [_, setOutput] = React.useState<string | null>(null);
  const [errorText, setErrorText] = React.useState("");

  // Auto-check connected accounts on mount when already connected.
  React.useEffect(() => {
    if (!props.isConnected) {
      return;
    }
    const api = getDesktopApiOrNull();
    if (!api) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.gogAuthList();
        if (cancelled) {
          return;
        }
        if (res.ok && res.stdout?.trim()) {
          setOutput(`Connected accounts:\n${res.stdout.trim()}`);
        }
      } catch {
        // Best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.isConnected]);

  const runGog = React.useCallback(async (fn: () => Promise<GogExecResult>) => {
    setError(undefined);
    setBusy(true);
    try {
      const res = await fn();
      const out = [
        `ok: ${res.ok ? "true" : "false"}`,
        `code: ${res.code ?? "null"}`,
        res.stderr ? `stderr:\n${res.stderr.trim()}` : "",
        res.stdout ? `stdout:\n${res.stdout.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      setOutput(out || "(no output)");
      if (!res.ok) {
        setError(res.stderr?.trim() || "Google Workspace connection failed");
      }
      return res;
    } catch (err) {
      setError(errorToMessage(err));
      setOutput(null);
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const handleConnect = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    if (!api) {
      setError("Desktop API not available");
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
      setErrorText("Please enter your API key to continue");
      return;
    }

    const api = getDesktopApiOrNull();
    if (!api) {
      setError("Desktop API not available");
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
        Connects your Google account locally to enable email and calendar skills. This opens a
        browser for consent. Secrets are stored locally.
      </div>
      <div className={sm.UiSkillModalField}>
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
      </div>

      <div className="UiBanner UiLiquidBanner">
        <div>
          <div className="UiBannerTitle">How to connect your Google account</div>
          <div className="UiBannerSubtitle">
            Google may show an extra verification screen while our app is under review. This is
            normal for new apps. To continue safely сlick “Advanced” and select “Go to Atomic Bot”.
            Your Google account remains protected.
          </div>
        </div>
        <div className="UiBannerImageContainer">
          <img src={connectGoogleImage} alt="" />
        </div>
      </div>

      <div style={{ height: props.isConnected ? "117" : "54px" }}></div>

      <div className={sm.UiSkillModalActionsWrapper}>
        <div className={sm.UiSkillModalActions}>
          <ActionButton variant="primary" disabled={busy} onClick={() => void handleConnect()}>
            {busy ? "Connecting…" : "Connect"}
          </ActionButton>
          <ActionButton disabled={busy} onClick={() => void handleCheck()}>
            {busy ? "Checking…" : "Check"}
          </ActionButton>
        </div>

        {/*{output && <pre className={sm.UiSkillModalOutput}>{output}</pre>}*/}
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
    </div>
  );
}
