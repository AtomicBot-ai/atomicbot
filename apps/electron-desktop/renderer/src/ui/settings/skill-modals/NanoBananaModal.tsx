import React from "react";

import { ActionButton, InlineError, TextInput } from "../../kit";
import type { ConfigSnapshot, GatewayRpcLike } from "../../onboarding/welcome/types";

/** Safely extract an error message string from an unknown thrown value. */
function errorMessage(err: unknown): string {
  if (err instanceof Error) {return err.message;}
  if (typeof err === "string") {return err;}
  if (err && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === "string") {return obj.message;}
    if (typeof obj.error === "string") {return obj.error;}
    try {
      return JSON.stringify(err);
    } catch {
      // fall through
    }
  }
  return String(err);
}

type SkillStatusEntry = {
  name: string;
  skillKey: string;
  disabled: boolean;
  eligible: boolean;
  missing: { bins: string[]; env: string[] };
};

export function NanoBananaModalContent(props: {
  gw: GatewayRpcLike;
  loadConfig: () => Promise<ConfigSnapshot>;
  isConnected: boolean;
  onConnected: () => void;
  onDisabled: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [apiKey, setApiKey] = React.useState("");
  const [skillInfo, setSkillInfo] = React.useState<SkillStatusEntry | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Fetch skill status on mount.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const report = await props.gw.request<{ skills?: SkillStatusEntry[] }>("skills.status", {});
        if (cancelled) {return;}
        const entry = report.skills?.find(
          (s) => s.skillKey === "nano-banana-pro" || s.name === "nano-banana-pro"
        );
        if (entry) {
          setSkillInfo(entry);
        }
      } catch {
        // Best-effort.
      } finally {
        if (!cancelled) {setLoading(false);}
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.gw]);

  const handleSaveKey = React.useCallback(async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setError("API key is required.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus("Saving API key…");
    try {
      await props.gw.request("skills.update", {
        skillKey: "nano-banana-pro",
        enabled: true,
        env: { GEMINI_API_KEY: trimmed },
      });
      setApiKey("");
      setStatus("API key saved. Nano Banana is ready.");
      props.onConnected();
    } catch (err) {
      setError(errorMessage(err));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [apiKey, props]);

  const handleEnable = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    setStatus("Enabling…");
    try {
      await props.gw.request("skills.update", {
        skillKey: "nano-banana-pro",
        enabled: true,
      });
      setStatus("Nano Banana enabled.");
      props.onConnected();
    } catch (err) {
      setError(errorMessage(err));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [props]);

  const missingEnv = skillInfo?.missing?.env?.length ?? 0;
  const missingBins = skillInfo?.missing?.bins ?? [];
  const needsApiKey = missingEnv > 0;
  const isInstalled = skillInfo != null;
  const isDisabled = skillInfo?.disabled === true;

  return (
    <div className="UiSkillModalContent">
      <div className="UiSectionSubtitle">
        Generate or edit images from text prompts using Google Gemini (Nano Banana Pro).
      </div>

      {loading && <div className="UiSkillModalStatus">Checking skill status…</div>}
      {error && <InlineError>{error}</InlineError>}
      {status && <div className="UiSkillModalStatus">{status}</div>}

      {!loading && !isInstalled && (
        <InlineError>
          Nano Banana Pro skill not found. Make sure OpenClaw is up to date.
        </InlineError>
      )}

      {!loading && isInstalled && missingBins.length > 0 && (
        <InlineError>
          Missing required binaries: {missingBins.join(", ")}. Install them and restart.
        </InlineError>
      )}

      {!loading && isInstalled && (
        <div className="UiSkillModalField">
          <label className="UiSkillModalLabel">Gemini API key</label>
          <TextInput
            type="password"
            value={apiKey}
            onChange={setApiKey}
            placeholder={
              props.isConnected && !needsApiKey
                ? "••••••••  (leave empty to keep current)"
                : "AIza..."
            }
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
          />
          <div style={{ marginTop: 6, fontSize: 13 }}>
            <a
              href="https://aistudio.google.com/apikey"
              className="UiLink"
              onClick={(e) => {
                e.preventDefault();
                void window.openclawDesktop?.openExternal("https://aistudio.google.com/apikey");
              }}
            >
              Get API key from Google AI Studio ↗
            </a>
          </div>
        </div>
      )}

      {!loading && isInstalled && (
        <div className="UiSkillModalActions">
          {needsApiKey || apiKey.trim() ? (
            <ActionButton
              variant="primary"
              disabled={busy || !apiKey.trim()}
              onClick={() => void handleSaveKey()}
            >
              {busy ? "Saving…" : "Save key"}
            </ActionButton>
          ) : isDisabled ? (
            <ActionButton
              variant="primary"
              disabled={busy}
              onClick={() => void handleEnable()}
            >
              {busy ? "Enabling…" : "Enable"}
            </ActionButton>
          ) : null}
        </div>
      )}

      {props.isConnected && (
        <div className="UiSkillModalDangerZone">
          <button
            type="button"
            className="UiSkillModalDisableButton"
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
