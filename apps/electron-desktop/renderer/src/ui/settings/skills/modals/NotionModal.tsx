import React from "react";

import sm from "./SkillModal.module.css";
import { ActionButton, InlineError, TextInput } from "@shared/kit";
import { errorToMessage } from "@shared/toast";
import { getObject } from "@shared/utils/configHelpers";
import { useWelcomeNotion } from "@ui/onboarding/hooks/useWelcomeNotion";
import type { ConfigSnapshot, GatewayRpcLike } from "@ui/onboarding/hooks/types";

export function NotionModalContent(props: {
  gw: GatewayRpcLike;
  loadConfig: () => Promise<ConfigSnapshot>;
  isConnected: boolean;
  onConnected: () => void;
  onDisabled: () => void;
}) {
  const { gw, loadConfig, isConnected, onConnected, onDisabled } = props;
  const [apiKey, setApiKey] = React.useState("");
  const [hasExistingKey, setHasExistingKey] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const run = React.useCallback(async <T,>(fn: () => Promise<T>) => fn(), []);
  const markSkillConnected = React.useCallback(() => {}, []);
  const goSkills = React.useCallback(() => {}, []);

  const { saveNotionApiKey } = useWelcomeNotion({
    gw,
    loadConfig,
    setError,
    setStatus,
    run,
    markSkillConnected,
    goSkills,
  });

  // Pre-fill: detect if API key is already configured.
  React.useEffect(() => {
    if (!isConnected) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await loadConfig();
        if (cancelled) {
          return;
        }
        const cfg = getObject(snap.config);
        const skills = getObject(cfg.skills);
        const entries = getObject(skills.entries);
        const notion = getObject(entries.notion);
        if (typeof notion.apiKey === "string" && notion.apiKey.trim()) {
          setHasExistingKey(true);
        }
      } catch {
        // Best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, loadConfig]);

  const handleConnect = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const ok = await saveNotionApiKey(apiKey);
      if (ok) {
        onConnected();
      }
    } catch (err) {
      setError(errorToMessage(err));
    } finally {
      setBusy(false);
    }
  }, [apiKey, onConnected, saveNotionApiKey]);

  return (
    <div className={sm.UiSkillModalContent}>
      <div className="UiSectionSubtitle">
        Create, search, update and organize your notes, docs, and knowledge base. Enter your Notion
        Integration API key below.
      </div>
      {error && <InlineError>{error}</InlineError>}
      {status && <div className={sm.UiSkillModalStatus}>{status}</div>}
      {hasExistingKey && !apiKey && (
        <div className={sm.UiSkillModalStatus}>API key configured. Enter a new key to update.</div>
      )}

      <div className={sm.UiSkillModalField}>
        <label className={sm.UiSkillModalLabel}>Notion API key</label>
        <TextInput
          type="password"
          value={apiKey}
          onChange={setApiKey}
          placeholder={hasExistingKey ? "••••••••  (leave empty to keep current)" : "ntn_..."}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      <div className={sm.UiSkillModalActions}>
        <ActionButton
          variant="primary"
          disabled={busy || (!apiKey.trim() && !isConnected)}
          onClick={() => void handleConnect()}
        >
          {busy ? "Connecting…" : isConnected ? "Update" : "Connect"}
        </ActionButton>
      </div>

      {(isConnected || hasExistingKey) && (
        <div className={sm.UiSkillModalDangerZone}>
          <button
            type="button"
            className={sm.UiSkillModalDisableButton}
            disabled={busy}
            onClick={onDisabled}
          >
            Disable
          </button>
        </div>
      )}
    </div>
  );
}
