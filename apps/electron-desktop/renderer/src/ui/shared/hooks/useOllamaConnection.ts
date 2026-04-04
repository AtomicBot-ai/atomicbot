import React from "react";

export type OllamaMode = "local" | "cloud";
export type OllamaConnectionStatus = "idle" | "testing" | "ok" | "error";

export const OLLAMA_DEFAULT_BASE_URL = "http://127.0.0.1:11434";

export const OLLAMA_SETUP_STEPS: Record<OllamaMode, string[]> = {
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

type UseOllamaConnectionOptions = {
  initialMode?: OllamaMode;
  initialBaseUrl?: string;
  onConnectionSuccess?: () => void;
};

export function useOllamaConnection(options: UseOllamaConnectionOptions = {}) {
  const {
    initialMode = "local",
    initialBaseUrl = OLLAMA_DEFAULT_BASE_URL,
    onConnectionSuccess,
  } = options;

  const [mode, setMode] = React.useState<OllamaMode>(initialMode);
  const [baseUrl, setBaseUrlRaw] = React.useState(initialBaseUrl);
  const [apiKey, setApiKey] = React.useState("");
  const [connectionStatus, setConnectionStatus] = React.useState<OllamaConnectionStatus>("idle");
  const [connectionError, setConnectionError] = React.useState("");

  const setBaseUrl = React.useCallback((value: string) => {
    setBaseUrlRaw(value);
    setConnectionStatus("idle");
  }, []);

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
        onConnectionSuccess?.();
      } else {
        setConnectionStatus("error");
        setConnectionError(`HTTP ${res.status}`);
      }
    } catch (err) {
      setConnectionStatus("error");
      const msg = err instanceof Error ? err.message : String(err);
      setConnectionError(msg.includes("abort") ? "Connection timed out" : msg);
    }
  }, [baseUrl, apiKey, mode, onConnectionSuccess]);

  const resetConnection = React.useCallback(() => {
    setConnectionStatus("idle");
    setConnectionError("");
  }, []);

  return {
    mode,
    setMode,
    baseUrl,
    setBaseUrl,
    apiKey,
    setApiKey,
    connectionStatus,
    connectionError,
    testConnection,
    resetConnection,
  };
}
