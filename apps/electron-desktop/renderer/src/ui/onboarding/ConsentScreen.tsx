import React from "react";

import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { openExternal } from "@shared/utils/openExternal";
import { FooterText, HeroPageLayout, PrimaryButton, SplashLogo } from "@shared/kit";
import { addToastError } from "@shared/toast";
import { optInRenderer, getCurrentUserId } from "@analytics";
import pkg from "../../../../package.json";
import s from "./ConsentScreen.module.css";

export type ConsentDesktopApi = NonNullable<Window["openclawDesktop"]> & {
  getConsentInfo?: () => Promise<{ accepted: boolean }>;
  acceptConsent?: () => Promise<{ ok: true }>;
};

export function ConsentScreen({
  onAccepted,
  onImport,
}: {
  onAccepted: () => void;
  onImport: () => void;
}) {
  const api = getDesktopApiOrNull() as ConsentDesktopApi | null;
  const [busy, setBusy] = React.useState(false);
  const appVersion = pkg.version || "0.0.0";
  const termsUrl = "https://atomicbot.ai/terms-of-service";
  const privacyUrl = "https://atomicbot.ai/privacy-policy";

  // Record consent acceptance, enable analytics by default, then invoke the callback.
  const acceptAndRun = React.useCallback(
    async (callback: () => void) => {
      if (busy) {
        return;
      }
      if (!api || typeof api.acceptConsent !== "function") {
        addToastError("Desktop API is not available. Please restart the app.");
        return;
      }
      setBusy(true);
      try {
        await api.acceptConsent();
        if (api.analyticsSet) {
          await api.analyticsSet(true);
        }
        const userId = getCurrentUserId();
        if (userId) optInRenderer(userId);
        callback();
      } catch (err) {
        addToastError(err);
      } finally {
        setBusy(false);
      }
    },
    [api, busy]
  );

  return (
    <HeroPageLayout
      role="dialog"
      aria-label="User agreement"
      variant="compact"
      align="center"
      hideTopbar
    >
      <div className={s.UiConsentStage}>
        <div className={s.UiConsentCenter}>
          <SplashLogo size={72} iconAlt="Atomic Bot" />
          <div className={s.UiConsentTitle}>Welcome to Atomic Bot</div>

          <PrimaryButton
            className={s.UiConsentButton}
            disabled={busy}
            onClick={() => void acceptAndRun(onAccepted)}
          >
            Create a new AI agent
          </PrimaryButton>

          <button
            type="button"
            className={s.UiConsentSecondaryButton}
            disabled={busy}
            onClick={() => void acceptAndRun(onImport)}
          >
            Import an existing setup
          </button>

          <div className="UiLinkContainer">
            <span>
              By clicking the button, you agree to our{" "}
              <a
                className="UiLink UiLinkMainPage"
                href={termsUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openExternal(termsUrl);
                }}
              >
                Terms of Use.
              </a>
            </span>
          </div>
        </div>

        <FooterText>Version {appVersion}</FooterText>
      </div>
    </HeroPageLayout>
  );
}
