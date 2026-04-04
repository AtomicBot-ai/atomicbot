import React from "react";

import sm from "./SkillModal.module.css";
import { useSkillModalState } from "./useSkillModalState";
import { ActionButton, InlineError, TextInput } from "@shared/kit";
import { useWelcomeSlack } from "@ui/onboarding/hooks/useWelcomeSlack";
import type { ConfigSnapshot, GatewayRpcLike } from "@ui/onboarding/hooks/types";

export function SlackModalContent(props: {
  gw: GatewayRpcLike;
  loadConfig: () => Promise<ConfigSnapshot>;
  isConnected: boolean;
  onConnected: () => void;
  onDisabled: () => void;
}) {
  const [botName, setBotName] = React.useState("");
  const [botToken, setBotToken] = React.useState("");
  const [appToken, setAppToken] = React.useState("");
  const {
    busy,
    error,
    status,
    setError,
    setStatus,
    run,
    markSkillConnected,
    goSkills: goSlackReturn,
    wrapAction,
  } = useSkillModalState();

  const { saveSlackConfig } = useWelcomeSlack({
    gw: props.gw,
    loadConfig: props.loadConfig,
    setError,
    setStatus,
    run,
    markSkillConnected,
    goSlackReturn,
  });

  const handleConnect = React.useCallback(async () => {
    await wrapAction(async () => {
      setStatus(null);
      const ok = await saveSlackConfig({
        botName: botName.trim() || "openclaw",
        botToken,
        appToken,
        groupPolicy: "open",
        channelAllowlist: [],
        dmPolicy: "open",
        dmAllowFrom: [],
      });
      if (ok) {
        props.onConnected();
      }
    });
  }, [appToken, botName, botToken, props, saveSlackConfig, wrapAction, setStatus]);

  return (
    <div className={sm.UiSkillModalContent}>
      <div className="UiSectionSubtitle">
        Send messages, react, and manage pins in your Slack workspace. Enter your Slack bot
        credentials below.
      </div>
      {error && <InlineError>{error}</InlineError>}
      {status && <div className={sm.UiSkillModalStatus}>{status}</div>}
      {props.isConnected && !botToken && !appToken && (
        <div className={sm.UiSkillModalStatus}>Tokens configured. Enter new values to update.</div>
      )}

      <div className={sm.UiSkillModalField}>
        <label className={sm.UiSkillModalLabel}>Bot name (optional)</label>
        <TextInput
          type="text"
          value={botName}
          onChange={setBotName}
          placeholder="openclaw"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      <div className={sm.UiSkillModalField}>
        <label className={sm.UiSkillModalLabel}>Bot token</label>
        <TextInput
          type="password"
          value={botToken}
          onChange={setBotToken}
          placeholder={props.isConnected ? "••••••••  (leave empty to keep current)" : "xoxb-..."}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      <div className={sm.UiSkillModalField}>
        <label className={sm.UiSkillModalLabel}>App token</label>
        <TextInput
          type="password"
          value={appToken}
          onChange={setAppToken}
          placeholder={props.isConnected ? "••••••••  (leave empty to keep current)" : "xapp-..."}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      <div className={sm.UiSkillModalActions}>
        <ActionButton
          variant="primary"
          disabled={busy || (!botToken.trim() && !appToken.trim() && !props.isConnected)}
          onClick={() => void handleConnect()}
        >
          {busy ? "Connecting…" : props.isConnected ? "Update" : "Connect"}
        </ActionButton>
      </div>

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
