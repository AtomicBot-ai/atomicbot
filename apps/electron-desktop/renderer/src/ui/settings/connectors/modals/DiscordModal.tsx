import React from "react";

import sm from "@ui/settings/skills/modals/SkillModal.module.css";
import { ActionButton, InlineError, TextInput } from "@shared/kit";
import { errorToMessage } from "@shared/toast";
import { getObject } from "@shared/utils/configHelpers";
import type { ConfigSnapshot, GatewayRpcLike } from "@ui/onboarding/hooks/types";

export function DiscordModalContent(props: {
  gw: GatewayRpcLike;
  loadConfig: () => Promise<ConfigSnapshot>;
  isConnected: boolean;
  onConnected: () => void;
  onDisabled: () => void;
}) {
  const { gw, loadConfig, isConnected, onConnected, onDisabled } = props;
  const [token, setToken] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [hasExistingToken, setHasExistingToken] = React.useState(false);

  // Pre-fill: detect existing token.
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
        const discord = getObject(channels.discord);
        if (typeof discord.token === "string" && discord.token.trim()) {
          setHasExistingToken(true);
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
    const t = token.trim();
    if (!t && !isConnected) {
      setError("Discord bot token is required.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus("Saving Discord configuration…");
    try {
      const snap = await loadConfig();
      const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
      if (!baseHash) {
        throw new Error("Config base hash missing. Reload and try again.");
      }

      const patch: Record<string, unknown> = { enabled: true };
      if (t) {
        patch.token = t;
      }

      await gw.request("config.patch", {
        baseHash,
        raw: JSON.stringify({ channels: { discord: patch } }, null, 2),
        note: "Settings: configure Discord",
      });
      setStatus("Discord configured.");
      onConnected();
    } catch (err) {
      setError(errorToMessage(err));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [gw, isConnected, loadConfig, onConnected, token]);

  return (
    <div className={sm.UiSkillModalContent}>
      <div className="UiSectionTitle">Discord</div>
      <div className="UiSectionSubtitle">
        Connect your Discord bot. Create one in the{" "}
        <a
          href="https://discord.com/developers/applications"
          target="_blank"
          rel="noopener noreferrer"
        >
          Discord Developer Portal
        </a>{" "}
        and copy the bot token.
      </div>
      {error && <InlineError>{error}</InlineError>}
      {status && <div className={sm.UiSkillModalStatus}>{status}</div>}
      {hasExistingToken && !token && (
        <div className={sm.UiSkillModalStatus}>
          Bot token configured. Enter a new token to update.
        </div>
      )}

      <div className={sm.UiSkillModalField}>
        <label className={sm.UiSkillModalLabel}>Bot token</label>
        <TextInput
          type="password"
          value={token}
          onChange={setToken}
          placeholder={hasExistingToken ? "••••••••  (leave empty to keep current)" : "Bot token"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      <div className={sm.UiSkillModalActions}>
        <ActionButton
          variant="primary"
          disabled={busy || (!token.trim() && !isConnected)}
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
