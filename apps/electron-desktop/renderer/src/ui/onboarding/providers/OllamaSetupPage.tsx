import React from "react";

import { GlassCard, HeroPageLayout, PrimaryButton, SecondaryButton, TextInput } from "@shared/kit";
import { OnboardingHeader } from "@ui/onboarding/OnboardingHeader";
import { useOnboardingStepEvent } from "@analytics/use-onboarding-step-event";
import {
  useOllamaConnection,
  OLLAMA_DEFAULT_BASE_URL,
  OLLAMA_SETUP_STEPS,
  type OllamaMode,
} from "@shared/hooks/useOllamaConnection";

export type { OllamaMode };

const OLLAMA_SETUP_STEPS_HEIGHT = 84;

export function OllamaSetupPage(props: {
  totalSteps: number;
  activeStep: number;
  busy: boolean;
  error: string | null;
  onSubmit: (params: { baseUrl: string; apiKey: string; mode: OllamaMode }) => void;
  onBack: () => void;
}) {
  useOnboardingStepEvent("api_key", "self-managed");

  const conn = useOllamaConnection();

  const handleSubmit = React.useCallback(() => {
    const normalizedUrl = conn.baseUrl.trim().replace(/\/+$/, "") || OLLAMA_DEFAULT_BASE_URL;
    const key = conn.mode === "cloud" ? conn.apiKey.trim() : "ollama-local";
    props.onSubmit({ baseUrl: normalizedUrl, apiKey: key, mode: conn.mode });
  }, [conn.baseUrl, conn.apiKey, conn.mode, props]);

  const canSubmit = conn.mode === "local" || conn.apiKey.trim().length > 0;
  const isBusy = props.busy || conn.connectionStatus === "testing";

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
            className={`UiAuthModeBtn ${conn.mode === "local" ? "UiAuthModeBtn--active" : ""}`}
            onClick={() => conn.setMode("local")}
            disabled={isBusy}
          >
            Local
          </button>
          <button
            type="button"
            className={`UiAuthModeBtn ${conn.mode === "cloud" ? "UiAuthModeBtn--active" : ""}`}
            onClick={() => conn.setMode("cloud")}
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
          {OLLAMA_SETUP_STEPS[conn.mode].map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        <div className="UiApiKeyInputRow">
          <TextInput
            value={conn.baseUrl}
            onChange={conn.setBaseUrl}
            placeholder={OLLAMA_DEFAULT_BASE_URL}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={isBusy}
            label="Base URL"
          />
        </div>

        {conn.mode === "cloud" && (
          <div className="UiApiKeyInputRow">
            <TextInput
              type="password"
              value={conn.apiKey}
              onChange={conn.setApiKey}
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

        <div className="UiApiKeySpacer" aria-hidden="true" />

        <div className="UiApiKeyButtonRow">
          <div />
          <div className="flex-row-center">
            <SecondaryButton
              size="sm"
              disabled={isBusy || !conn.baseUrl.trim()}
              onClick={() => void conn.testConnection()}
            >
              {conn.connectionStatus === "testing" ? "Testing..." : "Test Connection"}
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
