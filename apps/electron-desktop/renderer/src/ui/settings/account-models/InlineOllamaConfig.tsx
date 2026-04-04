/**
 * Inline Ollama configuration for the AI Models tab.
 * Supports Local and Cloud+Local modes with connection testing.
 */
import React from "react";

import { ActionButton, TextInput } from "@shared/kit";
import type { ModelProviderInfo } from "@shared/models/providers";
import { addToast } from "@shared/toast";
import {
  useOllamaConnection,
  OLLAMA_DEFAULT_BASE_URL,
  OLLAMA_SETUP_STEPS,
} from "@shared/hooks/useOllamaConnection";
import s from "./AccountModelsTab.module.css";

const LS_MODE_KEY = "openclaw.ollama.mode";
const LS_BASE_URL_KEY = "openclaw.ollama.baseUrl";

function readSavedMode(): "local" | "cloud" {
  try {
    const v = localStorage.getItem(LS_MODE_KEY);
    return v === "cloud" ? "cloud" : "local";
  } catch {
    return "local";
  }
}

function readSavedBaseUrl(): string {
  try {
    return localStorage.getItem(LS_BASE_URL_KEY) || OLLAMA_DEFAULT_BASE_URL;
  } catch {
    return OLLAMA_DEFAULT_BASE_URL;
  }
}

export function InlineOllamaConfig(props: {
  provider: ModelProviderInfo;
  busy: boolean;
  onSave: (params: { baseUrl: string; apiKey: string; mode: string }) => void;
  onRefreshModels?: () => Promise<void>;
}) {
  const { provider, busy } = props;

  const onRefresh = React.useCallback(() => {
    void props.onRefreshModels?.();
  }, [props]);

  const conn = useOllamaConnection({
    initialMode: readSavedMode(),
    initialBaseUrl: readSavedBaseUrl(),
    onConnectionSuccess: onRefresh,
  });

  const [saving, setSaving] = React.useState(false);

  const prevBusyRef = React.useRef(busy);
  React.useEffect(() => {
    if (prevBusyRef.current && !busy && saving) {
      addToast("Ollama configuration saved");
      setSaving(false);
    }
    prevBusyRef.current = busy;
  }, [busy, saving]);

  React.useEffect(() => {
    conn.setMode(readSavedMode());
    conn.setBaseUrl(readSavedBaseUrl());
    conn.setApiKey("");
    conn.resetConnection();
  }, [provider.id]); // eslint-disable-line react-hooks/exhaustive-deps -- reset on provider change only

  const isBusy = busy || conn.connectionStatus === "testing";
  const canSave = conn.mode === "local" || conn.apiKey.trim().length > 0;

  const handleSave = () => {
    const normalizedUrl = conn.baseUrl.trim().replace(/\/+$/, "") || OLLAMA_DEFAULT_BASE_URL;
    const key = conn.mode === "cloud" ? conn.apiKey.trim() : "ollama-local";
    try {
      localStorage.setItem(LS_MODE_KEY, conn.mode);
      localStorage.setItem(LS_BASE_URL_KEY, normalizedUrl);
    } catch {
      /* best-effort */
    }
    setSaving(true);
    props.onSave({ baseUrl: normalizedUrl, apiKey: key, mode: conn.mode });
  };

  return (
    <div className={s.apiKeySection}>
      <div className={s.apiKeyLabel}>Use your local or cloud AI models with Ollama</div>

      <div className={s.authToggle} role="radiogroup" aria-label="Ollama mode">
        <button
          type="button"
          className={`${s.authToggleBtn} ${conn.mode === "local" ? s["authToggleBtn--active"] : ""}`}
          onClick={() => conn.setMode("local")}
          disabled={isBusy}
        >
          Local
        </button>
        <button
          type="button"
          className={`${s.authToggleBtn} ${conn.mode === "cloud" ? s["authToggleBtn--active"] : ""}`}
          onClick={() => conn.setMode("cloud")}
          disabled={isBusy}
        >
          Cloud + Local
        </button>
      </div>

      <div className={s.apiKeyHelpText}>
        {conn.mode === "local"
          ? "Connect to a local Ollama instance running on your machine."
          : "Use Ollama Cloud models with your API key, plus local models."}
      </div>

      <ol className={`${s.apiKeyHelpText} ${s.apiKeySetupSteps}`}>
        {OLLAMA_SETUP_STEPS[conn.mode].map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <div
        className={s.dropdownRowWithoutMargin}
        style={conn.mode === "local" ? { gridTemplateColumns: "1fr" } : undefined}
      >
        <div className={s.dropdownGroupWithoutMargin}>
          <div className={s.dropdownLabel}>Base URL</div>
          <TextInput
            value={conn.baseUrl}
            onChange={conn.setBaseUrl}
            placeholder="http://127.0.0.1:11434"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={isBusy}
          />
        </div>

        {conn.mode === "cloud" && (
          <div className={s.dropdownGroupWithoutMargin}>
            <div className={s.dropdownLabel}>API Key</div>
            <TextInput
              type="password"
              value={conn.apiKey}
              onChange={conn.setApiKey}
              placeholder={provider.placeholder}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={isBusy}
            />
          </div>
        )}
      </div>

      <div className={s.apiKeyHelpText} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {conn.connectionStatus !== "idle" && (
          <>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                flexShrink: 0,
                background:
                  conn.connectionStatus === "ok"
                    ? "#22c55e"
                    : conn.connectionStatus === "error"
                      ? "#ef4444"
                      : "rgba(255,255,255,0.3)",
              }}
            />
            <span>
              {conn.connectionStatus === "testing" && "Testing connection..."}
              {conn.connectionStatus === "ok" && "Connected to Ollama"}
              {conn.connectionStatus === "error" &&
                `Connection failed: ${conn.connectionError}`}
            </span>
          </>
        )}
      </div>

      <div className={s.apiKeyActions}>
        <ActionButton disabled={isBusy || !conn.baseUrl.trim()} onClick={() => void conn.testConnection()}>
          {conn.connectionStatus === "testing" ? "Testing..." : "Test Connection"}
        </ActionButton>
        <ActionButton
          variant="primary"
          disabled={isBusy || !canSave}
          loading={busy}
          onClick={handleSave}
        >
          {busy ? "Saving..." : "Save"}
        </ActionButton>
      </div>
    </div>
  );
}
