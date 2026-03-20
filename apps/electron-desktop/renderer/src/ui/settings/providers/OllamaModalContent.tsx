import React from "react";

import { ActionButton, TextInput } from "@shared/kit";
import type { ModelProviderInfo } from "@shared/models/providers";
import { resolveProviderIconUrl } from "@shared/models/providers";
import s from "./OllamaModalContent.module.css";

export type OllamaMode = "local" | "cloud";

const OLLAMA_DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const OLLAMA_SETUP_STEPS: Record<OllamaMode, string[]> = {
  local: [
    "Download Ollama from ollama.com",
    "Launch it and download an AI model",
    "Test the connection and start using it in Atomic Bot",
  ],
  cloud: [
    "Download Ollama from ollama.com",
    "Launch it and download an AI model",
    "Create an API key in your Ollama Dashboard",
    "Paste it below and start using it in Atomic Bot",
  ],
};

type ConnectionStatus = "idle" | "testing" | "ok" | "error";

export function OllamaModalContent(props: {
  provider: ModelProviderInfo;
  busy: boolean;
  onSave: (params: { baseUrl: string; apiKey: string; mode: OllamaMode }) => void;
  onClose: () => void;
}) {
  const { provider, busy } = props;
  const [mode, setMode] = React.useState<OllamaMode>("local");
  const [baseUrl, setBaseUrl] = React.useState(OLLAMA_DEFAULT_BASE_URL);
  const [apiKey, setApiKey] = React.useState("");
  const [connectionStatus, setConnectionStatus] = React.useState<ConnectionStatus>("idle");
  const [connectionError, setConnectionError] = React.useState("");

  const testConnection = React.useCallback(async () => {
    setConnectionStatus("testing");
    setConnectionError("");
    const normalizedUrl = baseUrl.trim().replace(/\/+$/, "");
    try {
      const headers: Record<string, string> = {};
      if (mode === "cloud" && apiKey.trim()) {
        headers.Authorization = `Bearer ${apiKey.trim()}`;
      }
      const res = await fetch(`${normalizedUrl}/api/tags`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        setConnectionStatus("ok");
      } else {
        setConnectionStatus("error");
        setConnectionError(`HTTP ${res.status}`);
      }
    } catch (err) {
      setConnectionStatus("error");
      const msg = err instanceof Error ? err.message : String(err);
      setConnectionError(msg.includes("abort") ? "Connection timed out" : msg);
    }
  }, [baseUrl, apiKey, mode]);

  const handleSave = React.useCallback(() => {
    const normalizedUrl = baseUrl.trim().replace(/\/+$/, "") || OLLAMA_DEFAULT_BASE_URL;
    const key = mode === "cloud" ? apiKey.trim() : "ollama-local";
    props.onSave({ baseUrl: normalizedUrl, apiKey: key, mode });
  }, [baseUrl, apiKey, mode, props]);

  const canSave = mode === "local" || apiKey.trim().length > 0;

  return (
    <>
      <div className={s.UiModalProviderHeader}>
        <span className={s.UiModalProviderIcon} aria-hidden="true">
          <img src={resolveProviderIconUrl(provider.id)} alt="" />
        </span>
        <span className={s.UiModalProviderName}>{provider.name}</span>
      </div>

      <div className={s.UiModalHelpText}>
        {mode === "local"
          ? "Connect to a local Ollama instance running on your machine."
          : "Use Ollama Cloud models with your API key."}
      </div>

      <div className={s.UiModalModeToggle} role="radiogroup" aria-label="Ollama mode">
        <button
          type="button"
          className={`${s.UiModalModeBtn} ${mode === "local" ? s.UiModalModeBtnActive : ""}`}
          onClick={() => setMode("local")}
          disabled={busy}
        >
          Local
        </button>
        <button
          type="button"
          className={`${s.UiModalModeBtn} ${mode === "cloud" ? s.UiModalModeBtnActive : ""}`}
          onClick={() => setMode("cloud")}
          disabled={busy}
        >
          Cloud + Local
        </button>
      </div>

      <ol className={`${s.UiModalHelpText} ${s.UiModalSetupSteps}`}>
        {OLLAMA_SETUP_STEPS[mode].map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <div className={s.UiModalInputRow}>
        <div className={s.UiModalFieldLabel}>Base URL</div>
        <TextInput
          value={baseUrl}
          onChange={(v) => {
            setBaseUrl(v);
            setConnectionStatus("idle");
          }}
          placeholder={OLLAMA_DEFAULT_BASE_URL}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={busy}
        />
      </div>

      {mode === "cloud" && (
        <div className={s.UiModalInputRow}>
          <div className={s.UiModalFieldLabel}>API Key</div>
          <TextInput
            type="password"
            value={apiKey}
            onChange={setApiKey}
            placeholder={provider.placeholder}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
          />
        </div>
      )}

      {connectionStatus !== "idle" && (
        <div className={s.UiModalStatusRow}>
          <span
            className={`${s.UiModalStatusDot} ${
              connectionStatus === "ok"
                ? s.UiModalStatusDotOk
                : connectionStatus === "error"
                  ? s.UiModalStatusDotError
                  : s.UiModalStatusDotPending
            }`}
          />
          <span className={s.UiModalStatusText}>
            {connectionStatus === "testing" && "Testing connection..."}
            {connectionStatus === "ok" && "Connected to Ollama"}
            {connectionStatus === "error" && `Connection failed: ${connectionError}`}
          </span>
        </div>
      )}

      <div className={s.UiModalActions}>
        <ActionButton
          disabled={busy || connectionStatus === "testing" || !baseUrl.trim()}
          onClick={() => void testConnection()}
        >
          {connectionStatus === "testing" ? "Testing..." : "Test Connection"}
        </ActionButton>
        <ActionButton
          variant="primary"
          disabled={busy || !canSave}
          loading={busy}
          onClick={handleSave}
        >
          {busy ? "Saving..." : "Save"}
        </ActionButton>
      </div>
    </>
  );
}
