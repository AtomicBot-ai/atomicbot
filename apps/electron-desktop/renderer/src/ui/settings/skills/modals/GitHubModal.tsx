import React from "react";

import sm from "./SkillModal.module.css";
import { getDesktopApi, getDesktopApiOrNull } from "@ipc/desktopApi";
import { ActionButton, InlineError, TextInput } from "@shared/kit";
import { errorToMessage } from "@shared/toast";
import { useWelcomeGitHub } from "@ui/onboarding/hooks/useWelcomeGitHub";
import type { ConfigSnapshot, GatewayRpcLike } from "@ui/onboarding/hooks/types";

export function GitHubModalContent(props: {
  gw: GatewayRpcLike;
  loadConfig: () => Promise<ConfigSnapshot>;
  isConnected: boolean;
  onConnected: () => void;
  onDisabled: () => void;
}) {
  const [pat, setPat] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [ghUser, setGhUser] = React.useState<string | null>(null);
  const run = React.useCallback(async <T,>(fn: () => Promise<T>) => fn(), []);
  const markSkillConnected = React.useCallback(() => {}, []);
  const goSkills = React.useCallback(() => {}, []);

  const { enableGitHub } = useWelcomeGitHub({
    gw: props.gw,
    loadConfig: props.loadConfig,
    setError,
    setStatus,
    run,
    markSkillConnected,
    goSkills,
  });

  // Check current gh auth status when already connected.
  React.useEffect(() => {
    if (!props.isConnected) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const api = getDesktopApiOrNull();
        if (!api) {
          return;
        }
        const res = await api.ghApiUser();
        if (cancelled) {
          return;
        }
        if (res.ok && res.stdout?.trim()) {
          try {
            const parsed = JSON.parse(res.stdout) as { login?: string };
            if (parsed.login) {
              setGhUser(parsed.login);
            }
          } catch {
            // Not JSON; ignore.
          }
        }
      } catch {
        // Best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.isConnected]);

  const handleConnect = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    setStatus("Checking gh…");
    try {
      const api = getDesktopApi();

      const checkRes = await api.ghCheck();
      if (!checkRes.ok) {
        throw new Error(checkRes.stderr?.trim() || checkRes.stdout?.trim() || "gh check failed");
      }

      setStatus("Signing in to GitHub…");
      const loginRes = await api.ghAuthLoginPat({ pat });
      if (!loginRes.ok) {
        throw new Error(
          loginRes.stderr?.trim() || loginRes.stdout?.trim() || "gh auth login failed"
        );
      }

      setStatus("Verifying authentication…");
      const statusRes = await api.ghAuthStatus();
      if (!statusRes.ok) {
        throw new Error(
          statusRes.stderr?.trim() || statusRes.stdout?.trim() || "gh auth status failed"
        );
      }

      const userRes = await api.ghApiUser();
      if (!userRes.ok) {
        throw new Error(userRes.stderr?.trim() || userRes.stdout?.trim() || "gh api user failed");
      }

      const resolvedPath = checkRes.resolvedPath ?? loginRes.resolvedPath ?? null;
      const ok = await enableGitHub({ ghResolvedPath: resolvedPath });
      if (ok) {
        props.onConnected();
      }
    } catch (err) {
      setError(errorToMessage(err));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [enableGitHub, pat, props]);

  return (
    <div className={sm.UiSkillModalContent}>
      <div className="UiSectionSubtitle">
        Work with issues, pull requests, and workflows via the bundled gh CLI.
        {ghUser && (
          <>
            {" "}
            Currently authenticated as <strong>{ghUser}</strong>.
          </>
        )}
      </div>
      {error && <InlineError>{error}</InlineError>}
      {status && <div className={sm.UiSkillModalStatus}>{status}</div>}

      <div className={sm.UiSkillModalField}>
        <label className={sm.UiSkillModalLabel}>
          Personal Access Token (PAT)
          {props.isConnected ? " — enter a new PAT to re-authenticate" : ""}
        </label>
        <TextInput
          type="password"
          value={pat}
          onChange={setPat}
          placeholder="ghp_..."
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      <div className={sm.UiSkillModalActions}>
        <ActionButton
          variant="primary"
          disabled={busy || !pat.trim()}
          onClick={() => void handleConnect()}
        >
          {busy ? "Connecting…" : props.isConnected ? "Re-authenticate" : "Connect"}
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
