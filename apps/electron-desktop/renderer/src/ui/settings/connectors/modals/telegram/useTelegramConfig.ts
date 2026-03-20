import React from "react";

import { getObject, getStringArray } from "@shared/utils/configHelpers";
import { errorToMessage } from "@shared/toast";
import type { ConfigSnapshot, GatewayRpcLike } from "@ui/onboarding/hooks/types";

/** Normalize a user-typed Telegram ID (strip tg:/telegram: prefix). */
export function normalizeId(raw: string): string {
  const stripped = raw
    .trim()
    .replace(/^(telegram|tg):/i, "")
    .trim();
  return /^\d+$/.test(stripped) ? stripped : raw.trim();
}

export function useTelegramConfig(props: {
  gw: GatewayRpcLike;
  loadConfig: () => Promise<ConfigSnapshot>;
  isConnected: boolean;
  onConnected: () => void;
  onTokenSaved?: () => void;
}) {
  const { gw, loadConfig, isConnected, onConnected, onTokenSaved } = props;
  const [botToken, setBotToken] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [hasExistingToken, setHasExistingToken] = React.useState(false);

  // Two-step setup flow: "token" → "allowlist" (null = full form for editing).
  const [setupStep, setSetupStep] = React.useState<"token" | "allowlist" | null>(null);

  // Allowlist state.
  const [allowList, setAllowList] = React.useState<string[]>([]);
  const [newId, setNewId] = React.useState("");
  const [dmPolicy, setDmPolicy] = React.useState<string>("pairing");

  // Load existing config on mount.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await loadConfig();
        if (cancelled) {
          return;
        }
        const cfg = getObject(snap.config);
        const channels = getObject(cfg.channels);
        const telegram = getObject(channels.telegram);
        if (typeof telegram.botToken === "string" && telegram.botToken.trim()) {
          setHasExistingToken(true);
        } else {
          // No existing token: start the two-step setup flow.
          setSetupStep("token");
        }
        setAllowList(getStringArray(telegram.allowFrom));
        if (typeof telegram.dmPolicy === "string" && telegram.dmPolicy.trim()) {
          setDmPolicy(telegram.dmPolicy.trim());
        }
      } catch {
        // Best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadConfig]);

  /** Persist a config.patch for the Telegram channel. */
  const patchTelegram = React.useCallback(
    async (patch: Record<string, unknown>, note: string) => {
      const snap = await loadConfig();
      const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
      if (!baseHash) {
        throw new Error("Config base hash missing. Reload and try again.");
      }
      await gw.request("config.patch", {
        baseHash,
        raw: JSON.stringify(
          {
            channels: { telegram: patch },
            plugins: { entries: { telegram: { enabled: true } } },
          },
          null,
          2
        ),
        note,
      });
    },
    [gw, loadConfig]
  );

  // ── Bot token save ──────────────────────────────────────────

  const handleSaveToken = React.useCallback(async () => {
    const token = botToken.trim();
    if (!token && !isConnected) {
      setError("Bot token is required.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus("Saving Telegram bot token…");
    try {
      const patch: Record<string, unknown> = { enabled: true };
      if (token) {
        patch.botToken = token;
      }
      await patchTelegram(patch, "Settings: update Telegram bot token");
      setStatus("Bot token saved.");
      setBotToken("");
      setHasExistingToken(true);

      if (setupStep === "token") {
        // First-time setup: advance to allowlist step instead of closing.
        setSetupStep("allowlist");
        setError(null);
        setStatus(null);
        onTokenSaved?.();
      } else {
        // Editing existing token: close as before.
        onConnected();
      }
    } catch (err) {
      setError(errorToMessage(err));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [botToken, isConnected, onConnected, onTokenSaved, patchTelegram, setupStep]);

  // ── Allowlist add ───────────────────────────────────────────

  const handleAddId = React.useCallback(async () => {
    const id = normalizeId(newId);
    if (!id) {
      return;
    }
    if (allowList.includes(id)) {
      setError(`"${id}" is already in the allowlist.`);
      return;
    }
    setBusy(true);
    setError(null);
    setStatus("Adding to allowlist…");
    try {
      const merged = [...allowList, id];
      await patchTelegram(
        { enabled: true, dmPolicy: "allowlist", allowFrom: merged },
        "Settings: add Telegram allowFrom entry"
      );
      setAllowList(merged);
      setDmPolicy("allowlist");
      setNewId("");
      setStatus(`Added ${id}.`);
    } catch (err) {
      setError(errorToMessage(err));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [allowList, newId, patchTelegram]);

  // ── Allowlist remove ────────────────────────────────────────

  const handleRemoveId = React.useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      setStatus(`Removing ${id}…`);
      try {
        const filtered = allowList.filter((v) => v !== id);
        await patchTelegram({ allowFrom: filtered }, "Settings: remove Telegram allowFrom entry");
        setAllowList(filtered);
        setStatus(`Removed ${id}.`);
      } catch (err) {
        setError(errorToMessage(err));
        setStatus(null);
      } finally {
        setBusy(false);
      }
    },
    [allowList, patchTelegram]
  );

  // ── DM policy change ───────────────────────────────────────

  const handlePolicyChange = React.useCallback(
    async (policy: string) => {
      setDmPolicy(policy);
      setBusy(true);
      setError(null);
      setStatus("Updating DM policy…");
      try {
        await patchTelegram({ dmPolicy: policy }, "Settings: update Telegram DM policy");
        setStatus(`DM policy set to "${policy}".`);
      } catch (err) {
        setError(errorToMessage(err));
        setStatus(null);
      } finally {
        setBusy(false);
      }
    },
    [patchTelegram]
  );

  // ── Done handler for allowlist step ─────────────────────────

  const handleDone = React.useCallback(() => {
    const pending = normalizeId(newId);
    if (pending && !allowList.includes(pending)) {
      // Silently add the pending ID before closing.
      void (async () => {
        setBusy(true);
        try {
          const merged = [...allowList, pending];
          await patchTelegram(
            { enabled: true, dmPolicy: "allowlist", allowFrom: merged },
            "Settings: add Telegram allowFrom entry"
          );
          setAllowList(merged);
          setNewId("");
        } catch {
          // Best-effort: close anyway.
        } finally {
          setBusy(false);
          onConnected();
        }
      })();
    } else {
      onConnected();
    }
  }, [allowList, newId, onConnected, patchTelegram]);

  return {
    botToken,
    setBotToken,
    busy,
    error,
    status,
    hasExistingToken,
    setupStep,
    allowList,
    newId,
    setNewId,
    dmPolicy,
    handleSaveToken,
    handleAddId,
    handleRemoveId,
    handlePolicyChange,
    handleDone,
  };
}
