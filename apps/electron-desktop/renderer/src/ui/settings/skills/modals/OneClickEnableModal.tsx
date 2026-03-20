import React from "react";

import sm from "./SkillModal.module.css";
import { getDesktopApi } from "@ipc/desktopApi";
import { ActionButton, InlineError } from "@shared/kit";
import { errorToMessage } from "@shared/toast";
import { useWelcomeAppleNotes } from "@ui/onboarding/hooks/useWelcomeAppleNotes";
import { useWelcomeAppleReminders } from "@ui/onboarding/hooks/useWelcomeAppleReminders";
import type { ConfigSnapshot, GatewayRpcLike } from "@ui/onboarding/hooks/types";

/** Apple Notes one-click enable modal content. */
export function AppleNotesModalContent(props: {
  gw: GatewayRpcLike;
  loadConfig: () => Promise<ConfigSnapshot>;
  isConnected: boolean;
  onConnected: () => void;
  onDisabled: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const run = React.useCallback(async <T,>(fn: () => Promise<T>) => fn(), []);
  const markSkillConnected = React.useCallback(() => {}, []);
  const goSkills = React.useCallback(() => {}, []);

  const { enableAppleNotes } = useWelcomeAppleNotes({
    gw: props.gw,
    loadConfig: props.loadConfig,
    setError,
    setStatus,
    run,
    markSkillConnected,
    goSkills,
  });

  const handleEnable = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    setStatus("Checking memo…");
    try {
      const api = getDesktopApi();

      const res = await api.memoCheck();
      if (!res.ok) {
        throw new Error(res.stderr?.trim() || res.stdout?.trim() || "memo check failed");
      }
      const ok = await enableAppleNotes({ memoResolvedPath: res.resolvedPath });
      if (ok) {
        props.onConnected();
      }
    } catch (err) {
      setError(errorToMessage(err));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [enableAppleNotes, props]);

  return (
    <div className={sm.UiSkillModalContent}>
      <div className="UiSectionSubtitle">
        Create, search and organize notes without leaving your keyboard. This will check the bundled
        memo binary and enable the skill.
      </div>
      {error && <InlineError>{error}</InlineError>}
      {status && <div className={sm.UiSkillModalStatus}>{status}</div>}

      <div className={sm.UiSkillModalActions}>
        <ActionButton variant="primary" disabled={busy} onClick={() => void handleEnable()}>
          {busy ? "Enabling…" : props.isConnected ? "Re-enable" : "Enable Apple Notes"}
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

/** Apple Reminders one-click enable modal content. */
export function AppleRemindersModalContent(props: {
  gw: GatewayRpcLike;
  loadConfig: () => Promise<ConfigSnapshot>;
  isConnected: boolean;
  onConnected: () => void;
  onDisabled: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const run = React.useCallback(async <T,>(fn: () => Promise<T>) => fn(), []);
  const markSkillConnected = React.useCallback(() => {}, []);
  const goSkills = React.useCallback(() => {}, []);

  const { enableAppleReminders } = useWelcomeAppleReminders({
    gw: props.gw,
    loadConfig: props.loadConfig,
    setError,
    setStatus,
    run,
    markSkillConnected,
    goSkills,
  });

  const handleEnable = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    setStatus("Authorizing remindctl…");
    try {
      const api = getDesktopApi();

      const authorizeRes = await api.remindctlAuthorize();
      if (!authorizeRes.ok) {
        throw new Error(
          authorizeRes.stderr?.trim() || authorizeRes.stdout?.trim() || "remindctl authorize failed"
        );
      }

      setStatus("Checking Reminders access…");
      const todayRes = await api.remindctlTodayJson();
      if (!todayRes.ok) {
        throw new Error(
          todayRes.stderr?.trim() || todayRes.stdout?.trim() || "remindctl check failed"
        );
      }

      const resolvedPath = todayRes.resolvedPath ?? authorizeRes.resolvedPath ?? null;
      const ok = await enableAppleReminders({ remindctlResolvedPath: resolvedPath });
      if (ok) {
        props.onConnected();
      }
    } catch (err) {
      setError(errorToMessage(err));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [enableAppleReminders, props]);

  return (
    <div className={sm.UiSkillModalContent}>
      <div className="UiSectionSubtitle">
        Add, list and complete reminders without opening the Reminders app. This will authorize
        remindctl and enable the skill.
      </div>
      {error && <InlineError>{error}</InlineError>}
      {status && <div className={sm.UiSkillModalStatus}>{status}</div>}

      <div className={sm.UiSkillModalActions}>
        <ActionButton variant="primary" disabled={busy} onClick={() => void handleEnable()}>
          {busy ? "Enabling…" : props.isConnected ? "Re-enable" : "Enable Apple Reminders"}
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
