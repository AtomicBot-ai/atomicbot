import React from "react";

import sm from "@ui/settings/skills/modals/SkillModal.module.css";
import { ActionButton, InlineError, TextInput } from "@shared/kit";
import { errorToMessage } from "@shared/toast";
import { getObject, getStringArray } from "@shared/utils/configHelpers";
import type { ConfigSnapshot, GatewayRpcLike } from "@ui/onboarding/hooks/types";

type GroupPolicy = "open" | "allowlist" | "disabled";
type DmPolicy = "pairing" | "allowlist" | "open" | "disabled";

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const v of values) {
    const trimmed = String(v ?? "").trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(trimmed);
  }
  return next;
}

function parseList(raw: string): string[] {
  return uniqueStrings(
    raw
      .split(/[\n,;]+/g)
      .map((v) => v.trim())
      .filter(Boolean)
  );
}

export function SlackConnectorModalContent(props: {
  gw: GatewayRpcLike;
  loadConfig: () => Promise<ConfigSnapshot>;
  isConnected: boolean;
  onConnected: () => void;
  onDisabled: () => void;
}) {
  const { gw, loadConfig, isConnected, onConnected, onDisabled } = props;
  const [botToken, setBotToken] = React.useState("");
  const [appToken, setAppToken] = React.useState("");
  const [groupPolicy, setGroupPolicy] = React.useState<GroupPolicy>("allowlist");
  const [channelsRaw, setChannelsRaw] = React.useState("#general");
  const [dmPolicy, setDmPolicy] = React.useState<DmPolicy>("pairing");
  const [dmAllowFromRaw, setDmAllowFromRaw] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);

  // Pre-fill from config when already connected.
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
        const slack = getObject(channels.slack);
        const dm = getObject(slack.dm);

        // Group policy.
        if (typeof slack.groupPolicy === "string") {
          const gp = slack.groupPolicy as GroupPolicy;
          if (["open", "allowlist", "disabled"].includes(gp)) {
            setGroupPolicy(gp);
          }
        }

        // Channel allowlist — extract keys from channels.slack.channels object.
        const slackChannels = getObject(slack.channels);
        const channelKeys = Object.keys(slackChannels).filter((k) => k.trim());
        if (channelKeys.length > 0) {
          setChannelsRaw(channelKeys.join(", "));
        }

        // DM policy: prefer top-level alias, fall back to legacy nested key.
        const resolvedDmPolicy = (
          typeof slack.dmPolicy === "string" ? slack.dmPolicy : dm.policy
        ) as DmPolicy | undefined;
        if (
          resolvedDmPolicy &&
          ["pairing", "allowlist", "open", "disabled"].includes(resolvedDmPolicy)
        ) {
          setDmPolicy(resolvedDmPolicy);
        }

        // DM allowFrom: prefer top-level alias, fall back to legacy nested key.
        const rawAllowFrom = Array.isArray(slack.allowFrom) ? slack.allowFrom : dm.allowFrom;
        const dmAllow = getStringArray(rawAllowFrom).filter((v) => v !== "*");
        if (dmAllow.length > 0) {
          setDmAllowFromRaw(dmAllow.join(", "));
        }
      } catch {
        // Best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, loadConfig]);

  const canSave = React.useMemo(() => {
    // Need tokens for first connect; for update, can save policy changes alone.
    if (!isConnected && (!botToken.trim() || !appToken.trim())) {
      return false;
    }
    if (dmPolicy === "allowlist" && parseList(dmAllowFromRaw).length === 0) {
      return false;
    }
    return true;
  }, [appToken, botToken, dmAllowFromRaw, dmPolicy, isConnected]);

  const handleSave = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    setStatus("Saving Slack configuration…");
    try {
      const snap = await loadConfig();
      const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
      if (!baseHash) {
        throw new Error("Config base hash missing. Reload and try again.");
      }

      // Build channel allowlist object.
      const channelAllowlist = parseList(channelsRaw);
      const channelsObj =
        groupPolicy === "allowlist"
          ? Object.fromEntries(channelAllowlist.map((key) => [key, { allow: true }]))
          : undefined;

      // Build DM config.
      const dmAllowFrom =
        dmPolicy === "open"
          ? uniqueStrings([...parseList(dmAllowFromRaw), "*"])
          : dmPolicy === "allowlist"
            ? parseList(dmAllowFromRaw)
            : undefined;

      const patch: Record<string, unknown> = {
        enabled: true,
        groupPolicy,
        ...(channelsObj ? { channels: channelsObj } : {}),
        dmPolicy,
        ...(dmAllowFrom ? { allowFrom: dmAllowFrom } : {}),
        dm: { enabled: dmPolicy !== "disabled" },
      };
      if (botToken.trim()) {
        patch.botToken = botToken.trim();
      }
      if (appToken.trim()) {
        patch.appToken = appToken.trim();
      }

      await gw.request("config.patch", {
        baseHash,
        raw: JSON.stringify(
          {
            channels: { slack: patch },
            plugins: { entries: { slack: { enabled: true } } },
          },
          null,
          2
        ),
        note: "Settings: configure Slack connector",
      });
      setStatus("Slack configured.");
      onConnected();
    } catch (err) {
      setError(errorToMessage(err));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [
    appToken,
    botToken,
    channelsRaw,
    dmAllowFromRaw,
    dmPolicy,
    groupPolicy,
    gw,
    loadConfig,
    onConnected,
  ]);

  return (
    <div className={sm.UiSkillModalContent}>
      <div className="UiSectionSubtitle">
        Connect your Slack workspace via Socket Mode. See{" "}
        <a
          href="https://docs.openclaw.ai/slack"
          className="UiLink"
          target="_blank"
          rel="noopener noreferrer"
        >
          Slack setup docs
        </a>{" "}
        for details.
      </div>
      {error && <InlineError>{error}</InlineError>}
      {status && <div className={sm.UiSkillModalStatus}>{status}</div>}

      {/* ── Tokens ────────────────────────────────────────── */}
      <div className={sm.UiSkillModalField}>
        <label className={sm.UiSkillModalLabel}>
          Bot token (<code>xoxb-...</code>)
        </label>
        <TextInput
          type="password"
          value={botToken}
          onChange={setBotToken}
          placeholder={isConnected ? "••••••••  (leave empty to keep)" : "xoxb-..."}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      <div className={sm.UiSkillModalField}>
        <label className={sm.UiSkillModalLabel}>
          App token (<code>xapp-...</code>)
        </label>
        <TextInput
          type="password"
          value={appToken}
          onChange={setAppToken}
          placeholder={isConnected ? "••••••••  (leave empty to keep)" : "xapp-..."}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      {/* ── Channel policy ────────────────────────────────── */}
      <div className={sm.UiSkillModalField}>
        <label className={sm.UiSkillModalLabel}>Channel access policy</label>
        <div className={sm.UiSkillModalProviderSelect}>
          {(["allowlist", "open", "disabled"] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={
                groupPolicy === p
                  ? `${sm.UiSkillModalProviderOption} ${sm["UiSkillModalProviderOption--active"]}`
                  : sm.UiSkillModalProviderOption
              }
              disabled={busy}
              onClick={() => setGroupPolicy(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {groupPolicy === "allowlist" && (
        <div className={sm.UiSkillModalField}>
          <label className={sm.UiSkillModalLabel}>
            Allowed channels (names or IDs, comma-separated)
          </label>
          <textarea
            className={sm.UiSkillModalSelect}
            rows={2}
            disabled={busy}
            value={channelsRaw}
            onChange={(e) => setChannelsRaw(e.target.value)}
            placeholder="#general, C123..."
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            style={{
              resize: "vertical",
              fontFamily: "var(--font-mono, ui-monospace, monospace)",
              fontSize: 12,
            }}
          />
        </div>
      )}

      {/* ── DM policy ─────────────────────────────────────── */}
      <div className={sm.UiSkillModalField}>
        <label className={sm.UiSkillModalLabel}>DM policy</label>
        <div className={sm.UiSkillModalProviderSelect}>
          {(["pairing", "allowlist", "open", "disabled"] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={
                dmPolicy === p
                  ? `${sm.UiSkillModalProviderOption} ${sm["UiSkillModalProviderOption--active"]}`
                  : sm.UiSkillModalProviderOption
              }
              disabled={busy}
              onClick={() => setDmPolicy(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {(dmPolicy === "allowlist" || dmPolicy === "open") && (
        <div className={sm.UiSkillModalField}>
          <label className={sm.UiSkillModalLabel}>
            DM allowFrom (user IDs or @handles, comma-separated)
          </label>
          <textarea
            className={sm.UiSkillModalSelect}
            rows={2}
            disabled={busy}
            value={dmAllowFromRaw}
            onChange={(e) => setDmAllowFromRaw(e.target.value)}
            placeholder="@alice, U12345678"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            style={{
              resize: "vertical",
              fontFamily: "var(--font-mono, ui-monospace, monospace)",
              fontSize: 12,
            }}
          />
          {dmPolicy === "allowlist" && parseList(dmAllowFromRaw).length === 0 && (
            <InlineError>At least one allowFrom entry is required for DM allowlist.</InlineError>
          )}
          {dmPolicy === "open" && (
            <div className={sm.UiSkillModalStatus}>
              If left empty, everyone is allowed (wildcard <code>*</code>).
            </div>
          )}
        </div>
      )}

      {/* ── Save ──────────────────────────────────────────── */}
      <div className={sm.UiSkillModalActions}>
        <ActionButton
          variant="primary"
          disabled={busy || !canSave}
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
