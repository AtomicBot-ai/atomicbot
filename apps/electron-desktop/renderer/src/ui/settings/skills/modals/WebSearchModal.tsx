import React from "react";

import sm from "./SkillModal.module.css";
import { useSkillModalState } from "./useSkillModalState";
import { ActionButton, InlineError, TextInput } from "@shared/kit";
import { getObject } from "@shared/utils/configHelpers";
import {
  useWelcomeWebSearch,
  type WebSearchProvider,
} from "@ui/onboarding/hooks/useWelcomeWebSearch";
import type { ConfigSnapshot, GatewayRpcLike } from "@ui/onboarding/hooks/types";

export function WebSearchModalContent(props: {
  gw: GatewayRpcLike;
  loadConfig: () => Promise<ConfigSnapshot>;
  isConnected: boolean;
  onConnected: () => void;
  onDisabled: () => void;
}) {
  const { gw, loadConfig, isConnected, onConnected, onDisabled } = props;
  const [provider, setProvider] = React.useState<WebSearchProvider>("brave");
  const [apiKey, setApiKey] = React.useState("");
  const { busy, error, status, setError, setStatus, run, markSkillConnected, goSkills, wrapAction } =
    useSkillModalState();

  const { saveWebSearch } = useWelcomeWebSearch({
    gw,
    loadConfig,
    setError,
    setStatus,
    run,
    markSkillConnected,
    goSkills,
  });

  // Pre-fill provider from config when already connected.
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
        const tools = getObject(cfg.tools);
        const web = getObject(tools.web);
        const search = getObject(web.search);
        const p = typeof search.provider === "string" ? search.provider.trim() : "";
        if (p === "perplexity" || p === "brave") {
          setProvider(p);
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
    await wrapAction(async () => {
      setStatus(null);
      const ok = await saveWebSearch(provider, apiKey);
      if (ok) {
        onConnected();
      }
    });
  }, [apiKey, onConnected, provider, saveWebSearch, wrapAction, setStatus]);

  return (
    <div className={sm.UiSkillModalContent}>
      <div className="UiSectionSubtitle">
        Enable the web_search tool via Brave Search or Perplexity Sonar.
      </div>
      {error && <InlineError>{error}</InlineError>}
      {status && <div className={sm.UiSkillModalStatus}>{status}</div>}
      {isConnected && !apiKey && (
        <div className={sm.UiSkillModalStatus}>API key configured. Enter a new key to update.</div>
      )}

      <div className={sm.UiSkillModalField}>
        <label className={sm.UiSkillModalLabel}>Provider</label>
        <div className={sm.UiSkillModalProviderSelect}>
          <button
            type="button"
            className={
              provider === "brave"
                ? `${sm.UiSkillModalProviderOption} ${sm["UiSkillModalProviderOption--active"]}`
                : sm.UiSkillModalProviderOption
            }
            onClick={() => setProvider("brave")}
          >
            Brave Search
          </button>
          <button
            type="button"
            className={
              provider === "perplexity"
                ? `${sm.UiSkillModalProviderOption} ${sm["UiSkillModalProviderOption--active"]}`
                : sm.UiSkillModalProviderOption
            }
            onClick={() => setProvider("perplexity")}
          >
            Perplexity Sonar
          </button>
        </div>
      </div>

      <div className={sm.UiSkillModalField}>
        <label className={sm.UiSkillModalLabel}>API key</label>
        <TextInput
          type="password"
          value={apiKey}
          onChange={setApiKey}
          placeholder={
            isConnected
              ? "••••••••  (leave empty to keep current)"
              : provider === "brave"
                ? "BSA..."
                : "pplx-..."
          }
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
