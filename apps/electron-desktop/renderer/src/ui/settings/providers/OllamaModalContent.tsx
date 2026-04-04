import React from "react";

import { ActionButton, TextInput } from "@shared/kit";
import type { ModelProviderInfo } from "@shared/models/providers";
import { resolveProviderIconUrl } from "@shared/models/providers";
import {
  useOllamaConnection,
  OLLAMA_DEFAULT_BASE_URL,
  OLLAMA_SETUP_STEPS,
  type OllamaMode,
} from "@shared/hooks/useOllamaConnection";
import s from "./OllamaModalContent.module.css";

export type { OllamaMode };

export function OllamaModalContent(props: {
  provider: ModelProviderInfo;
  busy: boolean;
  onSave: (params: { baseUrl: string; apiKey: string; mode: OllamaMode }) => void;
  onClose: () => void;
}) {
  const { provider, busy } = props;
  const conn = useOllamaConnection();

  const handleSave = React.useCallback(() => {
    const normalizedUrl = conn.baseUrl.trim().replace(/\/+$/, "") || OLLAMA_DEFAULT_BASE_URL;
    const key = conn.mode === "cloud" ? conn.apiKey.trim() : "ollama-local";
    props.onSave({ baseUrl: normalizedUrl, apiKey: key, mode: conn.mode });
  }, [conn.baseUrl, conn.apiKey, conn.mode, props]);

  const canSave = conn.mode === "local" || conn.apiKey.trim().length > 0;

  return (
    <>
      <div className={s.UiModalProviderHeader}>
        <span className={s.UiModalProviderIcon} aria-hidden="true">
          <img src={resolveProviderIconUrl(provider.id)} alt="" />
        </span>
        <span className={s.UiModalProviderName}>{provider.name}</span>
      </div>

      <div className={s.UiModalHelpText}>
        {conn.mode === "local"
          ? "Connect to a local Ollama instance running on your machine."
          : "Use Ollama Cloud models with your API key."}
      </div>

      <div className={s.UiModalModeToggle} role="radiogroup" aria-label="Ollama mode">
        <button
          type="button"
          className={`${s.UiModalModeBtn} ${conn.mode === "local" ? s.UiModalModeBtnActive : ""}`}
          onClick={() => conn.setMode("local")}
          disabled={busy}
        >
          Local
        </button>
        <button
          type="button"
          className={`${s.UiModalModeBtn} ${conn.mode === "cloud" ? s.UiModalModeBtnActive : ""}`}
          onClick={() => conn.setMode("cloud")}
          disabled={busy}
        >
          Cloud + Local
        </button>
      </div>

      <ol className={`${s.UiModalHelpText} ${s.UiModalSetupSteps}`}>
        {OLLAMA_SETUP_STEPS[conn.mode].map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <div className={s.UiModalInputRow}>
        <div className={s.UiModalFieldLabel}>Base URL</div>
        <TextInput
          value={conn.baseUrl}
          onChange={conn.setBaseUrl}
          placeholder={OLLAMA_DEFAULT_BASE_URL}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={busy}
        />
      </div>

      {conn.mode === "cloud" && (
        <div className={s.UiModalInputRow}>
          <div className={s.UiModalFieldLabel}>API Key</div>
          <TextInput
            type="password"
            value={conn.apiKey}
            onChange={conn.setApiKey}
            placeholder={provider.placeholder}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
          />
        </div>
      )}

      {conn.connectionStatus !== "idle" && (
        <div className={s.UiModalStatusRow}>
          <span
            className={`${s.UiModalStatusDot} ${
              conn.connectionStatus === "ok"
                ? s.UiModalStatusDotOk
                : conn.connectionStatus === "error"
                  ? s.UiModalStatusDotError
                  : s.UiModalStatusDotPending
            }`}
          />
          <span className={s.UiModalStatusText}>
            {conn.connectionStatus === "testing" && "Testing connection..."}
            {conn.connectionStatus === "ok" && "Connected to Ollama"}
            {conn.connectionStatus === "error" &&
              `Connection failed: ${conn.connectionError}`}
          </span>
        </div>
      )}

      <div className={s.UiModalActions}>
        <ActionButton
          disabled={busy || conn.connectionStatus === "testing" || !conn.baseUrl.trim()}
          onClick={() => void conn.testConnection()}
        >
          {conn.connectionStatus === "testing" ? "Testing..." : "Test Connection"}
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
