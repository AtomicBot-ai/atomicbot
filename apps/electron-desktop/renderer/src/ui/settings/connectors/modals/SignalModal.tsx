import React from "react";

import sm from "@ui/settings/skills/modals/SkillModal.module.css";
import { ActionButton, InlineError, TextInput } from "@shared/kit";
import { errorToMessage } from "@shared/toast";
import { getObject } from "@shared/utils/configHelpers";
import type { ConfigSnapshot, GatewayRpcLike } from "@ui/onboarding/hooks/types";

export function SignalModalContent(props: {
  gw: GatewayRpcLike;
  loadConfig: () => Promise<ConfigSnapshot>;
  isConnected: boolean;
  onConnected: () => void;
  onDisabled: () => void;
}) {
  const { gw, loadConfig, isConnected, onConnected, onDisabled } = props;
  const [account, setAccount] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [existingAccount, setExistingAccount] = React.useState<string | null>(null);

  // Pre-fill: detect existing account.
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
        const channels = getObject(cfg.channels);
        const signal = getObject(channels.signal);
        if (typeof signal.account === "string" && signal.account.trim()) {
          setExistingAccount(signal.account.trim());
        }
      } catch {
        // Best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, loadConfig]);

  const handleSave = React.useCallback(async () => {
    const acc = account.trim();
    if (!acc && !isConnected) {
      setError("Signal account (phone number in E.164 format) is required.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus("Saving Signal configuration…");
    try {
      const snap = await loadConfig();
      const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
      if (!baseHash) {
        throw new Error("Config base hash missing. Reload and try again.");
      }

      const patch: Record<string, unknown> = { enabled: true };
      if (acc) {
        patch.account = acc;
      }

      await gw.request("config.patch", {
        baseHash,
        raw: JSON.stringify({ channels: { signal: patch } }, null, 2),
        note: "Settings: configure Signal",
      });
      setStatus("Signal configured.");
      onConnected();
    } catch (err) {
      setError(errorToMessage(err));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [account, gw, isConnected, loadConfig, onConnected]);

  return (
    <div className={sm.UiSkillModalContent}>
      <div className="UiSectionTitle">Signal</div>
      <div className="UiSectionSubtitle">
        Connect Signal via signal-cli. You need{" "}
        <a href="https://github.com/AsamK/signal-cli" target="_blank" rel="noopener noreferrer">
          signal-cli
        </a>{" "}
        installed and registered with your phone number.
      </div>
      {error && <InlineError>{error}</InlineError>}
      {status && <div className={sm.UiSkillModalStatus}>{status}</div>}

      {existingAccount && (
        <div className={sm.UiSkillModalStatus}>
          Connected account: <strong>{existingAccount}</strong>
        </div>
      )}

      <div className={sm.UiSkillModalField}>
        <label className={sm.UiSkillModalLabel}>Phone number (E.164 format)</label>
        <TextInput
          type="text"
          value={account}
          onChange={setAccount}
          placeholder={
            existingAccount ? `${existingAccount}  (leave empty to keep)` : "+1234567890"
          }
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      <div className={sm.UiSkillModalActions}>
        <ActionButton
          variant="primary"
          disabled={busy || (!account.trim() && !isConnected)}
          onClick={() => void handleSave()}
        >
          {busy ? "Saving…" : isConnected ? "Update" : "Connect"}
        </ActionButton>
      </div>

      {isConnected && (
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
