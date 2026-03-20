import React, { useState } from "react";

import { GlassCard, HeroPageLayout, PrimaryButton, SecondaryButton, TextInput } from "@shared/kit";
import { OnboardingHeader } from "@ui/onboarding/OnboardingHeader";
import { useOnboardingStepEvent } from "@analytics/use-onboarding-step-event";

export type OllamaMode = "local" | "cloud";

const OLLAMA_DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const OLLAMA_SETUP_STEPS_HEIGHT = 84;
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

export function OllamaSetupPage(props: {
  totalSteps: number;
  activeStep: number;
  busy: boolean;
  error: string | null;
  onSubmit: (params: { baseUrl: string; apiKey: string; mode: OllamaMode }) => void;
  onBack: () => void;
}) {
  useOnboardingStepEvent("api_key", "self-managed");
  const [mode, setMode] = useState<OllamaMode>("local");
  const [baseUrl, setBaseUrl] = useState(OLLAMA_DEFAULT_BASE_URL);
  const [apiKey, setApiKey] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [connectionError, setConnectionError] = useState("");

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

  const handleSubmit = React.useCallback(() => {
    const normalizedUrl = baseUrl.trim().replace(/\/+$/, "") || OLLAMA_DEFAULT_BASE_URL;
    const key = mode === "cloud" ? apiKey.trim() : "ollama-local";
    props.onSubmit({ baseUrl: normalizedUrl, apiKey: key, mode });
  }, [baseUrl, apiKey, mode, props]);

  const canSubmit = mode === "local" || apiKey.trim().length > 0;
  const isBusy = props.busy || connectionStatus === "testing";

  return (
    <HeroPageLayout variant="compact" align="center" aria-label="Ollama setup" context="onboarding">
      <OnboardingHeader
        totalSteps={props.totalSteps}
        activeStep={props.activeStep}
        onBack={props.onBack}
      />

      <GlassCard className="UiApiKeyCard UiGlassCardOnboarding">
        <div className="UiApiKeyTitle" style={{ marginBottom: 2 }}>
          Set up Ollama
        </div>
        <div className="UiApiKeySubtitle" style={{ marginBottom: 10 }}>
          Use your local or cloud AI models with Ollama
        </div>

        <div
          className="UiAuthModeToggle"
          role="radiogroup"
          aria-label="Ollama mode"
          style={{ marginBottom: 10 }}
        >
          <button
            type="button"
            className={`UiAuthModeBtn ${mode === "local" ? "UiAuthModeBtn--active" : ""}`}
            onClick={() => setMode("local")}
            disabled={isBusy}
          >
            Local
          </button>
          <button
            type="button"
            className={`UiAuthModeBtn ${mode === "cloud" ? "UiAuthModeBtn--active" : ""}`}
            onClick={() => setMode("cloud")}
            disabled={isBusy}
          >
            Cloud + Local
          </button>
        </div>

        <ol
          className="UiApiKeySubtitle"
          style={{
            margin: "0 0 6px",
            paddingLeft: 20,
            display: "grid",
            gap: 2,
            height: OLLAMA_SETUP_STEPS_HEIGHT,
            fontSize: 13,
            lineHeight: "16px",
          }}
        >
          {OLLAMA_SETUP_STEPS[mode].map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        <div className="UiApiKeyInputRow">
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
            disabled={isBusy}
            label="Base URL"
          />
        </div>

        {mode === "cloud" && (
          <div className="UiApiKeyInputRow">
            <TextInput
              type="password"
              value={apiKey}
              onChange={setApiKey}
              placeholder="ollama-api-key..."
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={isBusy}
              label="Ollama Cloud API Key"
            />
          </div>
        )}

        <div
          className="UiApiKeySubtitle"
          style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}
        >
          {connectionStatus !== "idle" && (
            <>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background:
                    connectionStatus === "ok"
                      ? "#22c55e"
                      : connectionStatus === "error"
                        ? "#ef4444"
                        : "rgba(255,255,255,0.3)",
                }}
              />
              <span>
                {connectionStatus === "testing" && "Testing connection..."}
                {connectionStatus === "ok" && "Connected to Ollama"}
                {connectionStatus === "error" && `Connection failed: ${connectionError}`}
              </span>
            </>
          )}
        </div>

        <div className="UiApiKeySpacer" aria-hidden="true" />

        <div className="UiApiKeyButtonRow">
          <div />
          <div className="flex-row-center">
            <SecondaryButton
              size="sm"
              disabled={isBusy || !baseUrl.trim()}
              onClick={() => void testConnection()}
            >
              {connectionStatus === "testing" ? "Testing..." : "Test Connection"}
            </SecondaryButton>
            <PrimaryButton
              size="sm"
              disabled={isBusy || !canSubmit}
              loading={props.busy}
              onClick={handleSubmit}
            >
              {props.busy ? "Saving..." : "Continue"}
            </PrimaryButton>
          </div>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
