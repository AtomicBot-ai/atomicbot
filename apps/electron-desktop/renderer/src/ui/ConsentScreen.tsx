import React from "react";

import { CheckboxRow, FooterText, HeroPageLayout, InlineError, PrimaryButton, SplashLogo } from "./kit";
import { LoadingScreen } from "./LoadingScreen";

export type ConsentDesktopApi = NonNullable<Window["openclawDesktop"]> & {
  getConsentInfo?: () => Promise<{ accepted: boolean }>;
  acceptConsent?: () => Promise<{ ok: true }>;
  startGateway?: () => Promise<{ ok: true }>;
};

export function ConsentScreen({ onAccepted }: { onAccepted: () => void }) {
  const api = window.openclawDesktop as ConsentDesktopApi | undefined;
  const [checked, setChecked] = React.useState(false);
  const [agreeRequired, setAgreeRequired] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const termsUrl = "https://atomicbot.ai/terms";
  const appVersion = api?.version?.trim() ? api.version.trim() : "0.0.0";

  const accept = React.useCallback(async () => {
    if (busy) {
      return;
    }
    if (!checked) {
      setAgreeRequired(true);
      return;
    }
    if (!api || typeof api.acceptConsent !== "function") {
      setError("Desktop API is not available. Please restart the app.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.acceptConsent();
      // Redundant safety: ensure gateway start even if consent handler changes.
      if (typeof api.startGateway === "function") {
        await api.startGateway();
      }
      onAccepted();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }, [api, busy, checked, onAccepted]);

  if (busy) {
    return <LoadingScreen state={null} />;
  }

  return (
    <HeroPageLayout
      role="dialog"
      aria-label="User agreement"
      variant="compact"
      align="center"
      hideTopbar
    >
      <div className="UiConsentStage">
        <div className="UiConsentCenter">
          <SplashLogo iconAlt="Atomic Bot" />
          <div className="UiConsentTitle">Welcome to Atomic Bot</div>
          <div className="UiConsentSubtitle">Your Personal AI Agent based on OpenClaw</div>

          <CheckboxRow
            checked={checked}
            error={agreeRequired && !checked}
            className="UiConsentAgreement"
            onChange={(next) => {
              setChecked(next);
              if (next) {
                setAgreeRequired(false);
              }
            }}
          >
            <span>
              By clicking &quot;Start&quot;, you agree to the{" "}
              <a
                className="UiLink"
                href={termsUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => {
                  // Prevent toggling the checkbox when clicking the link.
                  e.preventDefault();
                  e.stopPropagation();
                  const openExternal = window.openclawDesktop?.openExternal;
                  if (typeof openExternal === "function") {
                    void openExternal(termsUrl);
                    return;
                  }
                  // Fallback for non-desktop contexts.
                  window.open(termsUrl, "_blank", "noopener,noreferrer");
                }}
              >
                Terms of Use
              </a>
              .
            </span>
          </CheckboxRow>

          {error ? <InlineError>{error}</InlineError> : null}

          <PrimaryButton disabled={busy} onClick={() => void accept()}>
            Start
          </PrimaryButton>
        </div>

        <FooterText>Version {appVersion}</FooterText>
      </div>
    </HeroPageLayout>
  );
}

