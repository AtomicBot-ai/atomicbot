import React from "react";

import sm from "./SkillModal.module.css";
import { useSkillModalState } from "./useSkillModalState";
import { ActionButton, InlineError, TextInput } from "@shared/kit";
import { useWelcomeTrello } from "@ui/onboarding/hooks/useWelcomeTrello";
import type { ConfigSnapshot, GatewayRpcLike } from "@ui/onboarding/hooks/types";

export function TrelloModalContent(props: {
  gw: GatewayRpcLike;
  loadConfig: () => Promise<ConfigSnapshot>;
  isConnected: boolean;
  onConnected: () => void;
  onDisabled: () => void;
}) {
  const [apiKey, setApiKey] = React.useState("");
  const [token, setToken] = React.useState("");
  const { busy, error, status, setError, setStatus, run, markSkillConnected, goSkills, wrapAction } =
    useSkillModalState();

  const { saveTrello } = useWelcomeTrello({
    gw: props.gw,
    loadConfig: props.loadConfig,
    setError,
    setStatus,
    run,
    markSkillConnected,
    goSkills,
  });

  const handleConnect = React.useCallback(async () => {
    await wrapAction(async () => {
      setStatus(null);
      const ok = await saveTrello(apiKey, token);
      if (ok) {
        props.onConnected();
      }
    });
  }, [apiKey, props, saveTrello, token, wrapAction, setStatus]);

  return (
    <div className={sm.UiSkillModalContent}>
      <div className="UiSectionSubtitle">
        Track tasks, update boards and manage projects without opening Trello.
      </div>
      {error && <InlineError>{error}</InlineError>}
      {status && <div className={sm.UiSkillModalStatus}>{status}</div>}
      {props.isConnected && !apiKey && !token && (
        <div className={sm.UiSkillModalStatus}>
          Credentials configured. Enter new values to update.
        </div>
      )}

      <div className={sm.UiSkillModalField}>
        <label className={sm.UiSkillModalLabel}>Trello API key</label>
        <TextInput
          type="password"
          value={apiKey}
          onChange={setApiKey}
          placeholder={props.isConnected ? "••••••••  (leave empty to keep current)" : "API key"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      <div className={sm.UiSkillModalField}>
        <label className={sm.UiSkillModalLabel}>Trello token</label>
        <TextInput
          type="password"
          value={token}
          onChange={setToken}
          placeholder={props.isConnected ? "••••••••  (leave empty to keep current)" : "Token"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      <div className={sm.UiSkillModalActions}>
        <ActionButton
          variant="primary"
          disabled={busy || (!apiKey.trim() && !token.trim() && !props.isConnected)}
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
