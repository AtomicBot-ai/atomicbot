/**
 * Inline Ollama configuration for the AI Models tab.
 * Supports Local and Cloud+Local modes with connection testing.
 */
import React from "react";

import { ActionButton, TextInput } from "@shared/kit";
import type { ModelProviderInfo } from "@shared/models/providers";
import { addToast } from "@shared/toast";
import s from "./AccountModelsTab.module.css";

type OllamaMode = "local" | "cloud";
type ConnStatus = "idle" | "testing" | "ok" | "error";

const LS_MODE_KEY = "openclaw.ollama.mode";
const LS_BASE_URL_KEY = "openclaw.ollama.baseUrl";
const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
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

function readSavedMode(): OllamaMode {
  try {
    const v = localStorage.getItem(LS_MODE_KEY);
    return v === "cloud" ? "cloud" : "local";
  } catch {
    return "local";
  }
}

function readSavedBaseUrl(): string {
  try {
    return localStorage.getItem(LS_BASE_URL_KEY) || DEFAULT_BASE_URL;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

export function InlineOllamaConfig(props: {
  provider: ModelProviderInfo;
  busy: boolean;
  onSave: (params: { baseUrl: string; apiKey: string; mode: string }) => void;
  onRefreshModels?: () => Promise<void>;
}) {
  const { provider, busy } = props;

  const [mode, setMode] = React.useState<OllamaMode>(readSavedMode);
  const [baseUrl, setBaseUrl] = React.useState(readSavedBaseUrl);
  const [apiKey, setApiKey] = React.useState("");
  const [connStatus, setConnStatus] = React.useState<ConnStatus>("idle");
  const [connError, setConnError] = React.useState("");
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
    setMode(readSavedMode());
    setBaseUrl(readSavedBaseUrl());
    setApiKey("");
    setConnStatus("idle");
    setConnError("");
  }, [provider.id]);

  const isBusy = busy || connStatus === "testing";
  const canSave = mode === "local" || apiKey.trim().length > 0;

  const testConnection = async () => {
    setConnStatus("testing");
    setConnError("");
    const url = baseUrl.trim().replace(/\/+$/, "");
    try {
      const headers: Record<string, string> = {};
      if (mode === "cloud" && apiKey.trim()) {
        headers.Authorization = `Bearer ${apiKey.trim()}`;
      }
      const res = await fetch(`${url}/api/tags`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        setConnStatus("ok");
        void props.onRefreshModels?.();
      } else {
        setConnStatus("error");
        setConnError(`HTTP ${res.status}`);
      }
    } catch (err) {
      setConnStatus("error");
      const msg = err instanceof Error ? err.message : String(err);
      setConnError(msg.includes("abort") ? "Connection timed out" : msg);
    }
  };

  const handleSave = () => {
    const normalizedUrl = baseUrl.trim().replace(/\/+$/, "") || DEFAULT_BASE_URL;
    const key = mode === "cloud" ? apiKey.trim() : "ollama-local";
    try {
      localStorage.setItem(LS_MODE_KEY, mode);
      localStorage.setItem(LS_BASE_URL_KEY, normalizedUrl);
    } catch {
      /* best-effort */
    }
    setSaving(true);
    props.onSave({ baseUrl: normalizedUrl, apiKey: key, mode });
  };

  return (
    <div className={s.apiKeySection}>
      <div className={s.apiKeyLabel}>Use your local or cloud AI models with Ollama</div>

      <div className={s.authToggle} role="radiogroup" aria-label="Ollama mode">
        <button
          type="button"
          className={`${s.authToggleBtn} ${mode === "local" ? s["authToggleBtn--active"] : ""}`}
          onClick={() => setMode("local")}
          disabled={isBusy}
        >
          Local
        </button>
        <button
          type="button"
          className={`${s.authToggleBtn} ${mode === "cloud" ? s["authToggleBtn--active"] : ""}`}
          onClick={() => setMode("cloud")}
          disabled={isBusy}
        >
          Cloud + Local
        </button>
      </div>

      <div className={s.apiKeyHelpText}>
        {mode === "local"
          ? "Connect to a local Ollama instance running on your machine."
          : "Use Ollama Cloud models with your API key, plus local models."}
      </div>

      <ol className={`${s.apiKeyHelpText} ${s.apiKeySetupSteps}`}>
        {OLLAMA_SETUP_STEPS[mode].map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <div
        className={s.dropdownRowWithoutMargin}
        style={mode === "local" ? { gridTemplateColumns: "1fr" } : undefined}
      >
        <div className={s.dropdownGroupWithoutMargin}>
          <div className={s.dropdownLabel}>Base URL</div>
          <TextInput
            value={baseUrl}
            onChange={(v) => {
              setBaseUrl(v);
              setConnStatus("idle");
            }}
            placeholder="http://127.0.0.1:11434"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={isBusy}
          />
        </div>

        {mode === "cloud" && (
          <div className={s.dropdownGroupWithoutMargin}>
            <div className={s.dropdownLabel}>API Key</div>
            <TextInput
              type="password"
              value={apiKey}
              onChange={setApiKey}
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
        {connStatus !== "idle" && (
          <>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                flexShrink: 0,
                background:
                  connStatus === "ok"
                    ? "#22c55e"
                    : connStatus === "error"
                      ? "#ef4444"
                      : "rgba(255,255,255,0.3)",
              }}
            />
            <span>
              {connStatus === "testing" && "Testing connection..."}
              {connStatus === "ok" && "Connected to Ollama"}
              {connStatus === "error" && `Connection failed: ${connError}`}
            </span>
          </>
        )}
      </div>

      <div className={s.apiKeyActions}>
        <ActionButton disabled={isBusy || !baseUrl.trim()} onClick={() => void testConnection()}>
          {connStatus === "testing" ? "Testing..." : "Test Connection"}
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
