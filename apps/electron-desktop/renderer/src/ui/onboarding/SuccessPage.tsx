import React from "react";

import { GlassCard, HeroPageLayout, PrimaryButton } from "@shared/kit";
import { backendApi } from "@ipc/backendApi";
import { useOnboardingStepEvent } from "@analytics/use-onboarding-step-event";

import s from "./SuccessPage.module.css";

type BackendKeys = { openrouterApiKey: string | null; openaiApiKey: string | null };

export function SuccessPage(props: {
  jwt: string;
  onStartChat: (keys: BackendKeys | null) => void;
}) {
  useOnboardingStepEvent("finished", "paid");
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [keys, setKeys] = React.useState<BackendKeys | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 60;

    const poll = async () => {
      while (!cancelled && attempts < maxAttempts) {
        attempts++;
        try {
          const status = await backendApi.getStatus(props.jwt);

          if (status.hasKey) {
            const keys = await backendApi.getKeys(props.jwt);
            if (!cancelled) {
              setKeys(keys);
              setReady(true);
            }
            return;
          }
        } catch {
          // Retry on transient errors
        }
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (!cancelled) {
        setError(
          "Setup is taking longer than expected. You can start chatting — your server will be ready shortly."
        );
        setReady(true);
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [props.jwt]);

  return (
    <HeroPageLayout variant="compact" align="center" aria-label="Setup complete">
      <div className={s.UiSuccessConfettiLayer} aria-hidden="true">
        {Array.from({ length: 40 }).map((_, i) => (
          <span
            key={i}
            className={s.UiConfettiPiece}
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${2 + Math.random() * 3}s`,
              backgroundColor: [
                "#b0ff57",
                "#ff6b6b",
                "#4ecdc4",
                "#ffe66d",
                "#a855f7",
                "#06b6d4",
                "#fb923c",
                "#f472b6",
              ][i % 8],
            }}
          />
        ))}
      </div>

      <GlassCard className={`UiGlassCardOnboarding ${s.UiSuccessCard}`}>
        {ready ? (
          <>
            <div className={s.UiSuccessCheckmark}>
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                <circle cx="32" cy="32" r="32" fill="#22c55e" />
                <path
                  d="M20 32l8 8 16-16"
                  stroke="#fff"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className={s.UiSuccessTitle}>YOUR AGENT IS READY!</div>
            <div className={s.UiSuccessSubtitle}>
              Chat with your assistant, follow tasks and get help anytime
            </div>
            {error ? <div className={s.UiSuccessWarning}>{error}</div> : null}
            <PrimaryButton onClick={() => props.onStartChat(keys)}>Start chat</PrimaryButton>
          </>
        ) : (
          <>
            <div className={s.UiSuccessLoading}>
              <span className="UiButtonSpinner" aria-hidden="true" />
              <div className={s.UiSuccessLoadingText}>Provisioning your API keys...</div>
              <div className={s.UiSuccessLoadingHint}>This may take a moment</div>
            </div>
          </>
        )}
      </GlassCard>
    </HeroPageLayout>
  );
}
