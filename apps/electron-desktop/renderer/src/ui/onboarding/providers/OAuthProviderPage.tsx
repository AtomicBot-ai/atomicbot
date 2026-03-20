import React, { useCallback, useEffect, useRef, useState } from "react";

import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { useOnboardingStepEvent } from "@analytics/use-onboarding-step-event";
import { openExternal } from "@shared/utils/openExternal";
import { GlassCard, HeroPageLayout, OnboardingDots, PrimaryButton } from "@shared/kit";
import layoutStyles from "../OnboardingStepLayout.module.css";
import { errorToMessage } from "@shared/toast";
import { MODEL_PROVIDER_BY_ID, type ModelProvider } from "@shared/models/providers";

type OAuthState = "idle" | "waiting" | "signing-in" | "saving" | "error";

export function OAuthProviderPage(props: {
  totalSteps: number;
  activeStep: number;
  provider: ModelProvider;
  onSuccess: (profileId: string) => void;
  onBack: () => void;
}) {
  useOnboardingStepEvent("api_key", "self-managed");
  const meta = MODEL_PROVIDER_BY_ID[props.provider];
  const [state, setState] = useState<OAuthState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const abortRef = useRef(false);

  const startOAuth = useCallback(async () => {
    const desktopApi = getDesktopApiOrNull();
    if (!desktopApi) {
      setError("Desktop API is not available.");
      setState("error");
      return;
    }

    abortRef.current = false;
    setState("waiting");
    setError(null);
    setProgressMsg(null);

    // Listen for progress events from the main process.
    const unsub = desktopApi.onOAuthProgress((payload) => {
      if (payload.provider === props.provider) {
        setState("signing-in");
        setProgressMsg(payload.message);
      }
    });

    try {
      // The main process opens the browser and handles the full OAuth flow.
      const result = await desktopApi.oauthLogin(props.provider);
      unsub();

      if (abortRef.current) {
        return;
      }

      if (result?.ok && result.profileId) {
        setState("saving");
        props.onSuccess(result.profileId);
      } else {
        setState("error");
        setError("OAuth flow did not return a valid profile.");
      }
    } catch (err: unknown) {
      unsub();
      if (abortRef.current) {
        return;
      }
      setState("error");
      setError(errorToMessage(err));
    }
  }, [props.provider, props.onSuccess]);

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      abortRef.current = true;
    };
  }, []);

  const isBusy = state === "waiting" || state === "signing-in" || state === "saving";

  const statusText = (() => {
    switch (state) {
      case "waiting":
        return progressMsg ?? "Starting OAuth flow\u2026";
      case "signing-in":
        return progressMsg ?? "Waiting for sign-in in browser\u2026";
      case "saving":
        return "Saving credentials\u2026";
      default:
        return null;
    }
  })();

  return (
    <HeroPageLayout
      variant="compact"
      align="center"
      aria-label="OAuth provider setup"
      className={layoutStyles.UiSetupLayout}
    >
      <div className={layoutStyles.UiSetupHeader}>
        <div className={layoutStyles.UiSetupHeaderButton}>
          <button
            className="UiTextButton"
            type="button"
            onClick={() => {
              abortRef.current = true;
              props.onBack();
            }}
          >
            Back
          </button>
        </div>
        <div className={layoutStyles.UiSetupHeaderCenter}>
          <OnboardingDots totalSteps={props.totalSteps} activeStep={props.activeStep} />
        </div>
        <div className={layoutStyles.UiSetupHeaderButton} />
      </div>
      <GlassCard className="UiApiKeyCard UiGlassCardOnboarding">
        {meta?.helpTitle ? (
          <div className="UiApiKeyTitle">{meta.helpTitle}</div>
        ) : (
          <div className="UiApiKeyTitle">Sign in to {meta.name}</div>
        )}

        <div className="UiApiKeySubtitle">
          {meta.helpText}{" "}
          {meta.helpUrl ? (
            <a
              href={meta.helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="UiLink"
              onClick={(e) => {
                e.preventDefault();
                const url = meta.helpUrl;
                if (url) {
                  openExternal(url);
                }
              }}
            >
              Learn more ↗
            </a>
          ) : null}
        </div>

        {statusText && <div className="UiApiKeySubtitle">{statusText}</div>}

        {error && (
          <div style={{ color: "var(--color-danger, #f44)", fontSize: 14, marginBottom: 8 }}>
            {error}
          </div>
        )}

        <div className="UiApiKeySpacer" aria-hidden="true" />

        <div className="UiApiKeyButtonRow">
          <div />
          <PrimaryButton
            size="sm"
            disabled={isBusy}
            loading={isBusy}
            onClick={() => void startOAuth()}
            className="UiChatGPTButton"
          >
            {!isBusy && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="M14.4467 6.65265C14.5738 6.27574 14.6386 5.8811 14.6387 5.48387C14.6387 4.82656 14.4612 4.18112 14.1246 3.6139C13.4482 2.45222 12.1935 1.73502 10.8356 1.73502C10.5681 1.73502 10.3013 1.7629 10.0397 1.81818C9.68788 1.42705 9.256 1.11395 8.77257 0.899525C8.28913 0.685103 7.76512 0.57423 7.23508 0.574219H7.21128L7.20234 0.574271C5.55766 0.574271 4.09911 1.62141 3.59352 3.16513C3.07016 3.27089 2.57574 3.48575 2.14336 3.79531C1.71098 4.10488 1.3506 4.50201 1.08636 4.96012C0.75078 5.53075 0.573936 6.17874 0.57373 6.83848C0.573859 7.76568 0.92268 8.65984 1.55265 9.34783C1.42548 9.72473 1.36063 10.1194 1.36058 10.5166C1.36063 11.1739 1.53808 11.8194 1.87468 12.3866C2.27496 13.0742 2.88623 13.6187 3.62036 13.9414C4.35448 14.2641 5.17352 14.3485 5.95936 14.1822C6.31125 14.5734 6.74316 14.8865 7.22663 15.1009C7.7101 15.3153 8.23414 15.4262 8.76421 15.4263H8.78801L8.79768 15.4262C10.4433 15.4262 11.9013 14.379 12.4069 12.8339C12.9303 12.7281 13.4247 12.5132 13.8571 12.2037C14.2895 11.8941 14.6499 11.497 14.9141 11.0389C15.2494 10.4687 15.4259 9.82128 15.4258 9.16215C15.4256 8.23497 15.0768 7.34082 14.4469 6.65286L14.4467 6.65265ZM8.78896 14.4553H8.78507C8.12661 14.4551 7.48904 14.2271 6.98326 13.8111C7.01329 13.7952 7.04297 13.7786 7.07228 13.7614L10.0694 12.0532C10.1442 12.0112 10.2063 11.9504 10.2496 11.877C10.2929 11.8036 10.3157 11.7202 10.3157 11.6353V7.4634L11.5825 8.18512C11.5892 8.18839 11.5949 8.19323 11.5992 8.1992C11.6035 8.20518 11.6062 8.21212 11.6072 8.21939V11.672C11.6054 13.207 10.3448 14.4522 8.78896 14.4553ZM2.72832 11.9012C2.48076 11.4789 2.35033 10.9996 2.35016 10.5117C2.35016 10.3526 2.36424 10.1931 2.39168 10.0363C2.41396 10.0494 2.45285 10.0729 2.48075 10.0887L5.47783 11.7968C5.55255 11.8399 5.63753 11.8625 5.72405 11.8625C5.81057 11.8625 5.89553 11.8398 5.97024 11.7967L9.62936 9.71204V11.1555L9.62941 11.158C9.62941 11.165 9.62777 11.1718 9.62463 11.178C9.62148 11.1843 9.61691 11.1897 9.61128 11.1938L6.58151 12.9199C6.15281 13.1633 5.66688 13.2915 5.17225 13.2916C4.6771 13.2916 4.19066 13.1631 3.76172 12.919C3.33278 12.6749 2.9764 12.3239 2.72832 11.9011V11.9012ZM1.93984 5.44545C2.26902 4.8813 2.78878 4.44935 3.40817 4.22518C3.40817 4.25064 3.4067 4.29575 3.4067 4.32706V7.74339L3.40664 7.74619C3.40666 7.83102 3.42942 7.91433 3.47263 7.98767C3.51583 8.06101 3.57794 8.12176 3.65264 8.16375L7.31175 10.2481L6.04501 10.9698C6.03877 10.9739 6.0316 10.9764 6.02414 10.9771C6.01669 10.9777 6.00918 10.9766 6.00229 10.9737L2.97221 9.2462C2.54386 9.00136 2.18825 8.64974 1.94103 8.22657C1.6938 7.80341 1.56363 7.32356 1.56358 6.83511C1.56377 6.34744 1.69356 5.86833 1.94 5.4456L1.93984 5.44545ZM12.3478 7.83522L8.68869 5.75059L9.95549 5.02913C9.96173 5.02506 9.9689 5.02258 9.97636 5.02191C9.98381 5.02124 9.99132 5.02241 9.99821 5.02529L13.0282 6.75132C13.4569 6.99578 13.8129 7.34721 14.0605 7.77034C14.308 8.19346 14.4383 8.67339 14.4384 9.16194C14.4384 10.328 13.701 11.3714 12.5922 11.7742V8.25569C12.5923 8.25439 12.5923 8.25304 12.5923 8.25175C12.5923 8.16723 12.5697 8.08422 12.5268 8.01109C12.4838 7.93796 12.4221 7.87729 12.3478 7.83522ZM13.6087 5.96282C13.5792 5.94501 13.5495 5.92755 13.5196 5.91045L10.5226 4.20226C10.4478 4.15929 10.3629 4.13664 10.2764 4.13661C10.1899 4.13664 10.105 4.15929 10.0303 4.20226L6.37109 6.28694V4.84345L6.37104 4.84096C6.37104 4.82686 6.37782 4.81359 6.38922 4.80513L9.41899 3.08056C9.84755 2.83678 10.3335 2.70844 10.8282 2.70842C12.386 2.70842 13.6493 3.95493 13.6493 5.49201C13.6493 5.64974 13.6357 5.80719 13.6087 5.96266V5.96282ZM5.68236 8.53558L4.41531 7.81386C4.40866 7.81059 4.40293 7.80575 4.39863 7.79977C4.39433 7.79379 4.39159 7.78686 4.39066 7.77959V4.32696C4.39134 2.79071 5.65467 1.54524 7.2118 1.54524C7.8713 1.54537 8.50993 1.77333 9.01687 2.18954C8.99407 2.20183 8.95429 2.22351 8.92785 2.23932L5.93077 3.94746C5.85599 3.98944 5.79381 4.05021 5.75054 4.12358C5.70728 4.19696 5.68448 4.28034 5.68446 4.36523V4.36797L5.68236 8.53558ZM6.37051 7.07166L8.00022 6.1429L9.62993 7.07104V8.92794L8.00022 9.85613L6.37051 8.92794V7.07166Z"
                  fill="black"
                />
              </svg>
            )}

            {state === "error" ? "Retry" : isBusy ? "Signing in\u2026" : "Continue with ChatGPT"}
          </PrimaryButton>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
