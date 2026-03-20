import React from "react";
import { useNavigate } from "react-router-dom";

import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { GlassCard, HeroPageLayout, PrimaryButton } from "@shared/kit";
import { errorToMessage } from "@shared/toast";
import { useAppDispatch } from "@store/hooks";
import { setOnboarded } from "@store/slices/onboardingSlice";
import { routes } from "../app/routes";
import { OnboardingHeader } from "./OnboardingHeader";
import s from "./RestoreOptionPage.module.css";

type RestoreOption = "local" | "file";

type PageState = "idle" | "loading" | "error";

export function RestoreOptionPage(props: { totalSteps: number; activeStep: number }) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [selected, setSelected] = React.useState<RestoreOption>("local");
  const [pageState, setPageState] = React.useState<PageState>("idle");
  const [error, setError] = React.useState<string | null>(null);

  const handleBack = React.useCallback(() => {
    void navigate(routes.consent);
  }, [navigate]);

  const handleContinue = React.useCallback(async () => {
    if (selected === "file") {
      void navigate(`${routes.welcome}/restore-file`);
      return;
    }

    // "local" option: auto-detect ~/.openclaw, then restore or open folder picker
    const api = getDesktopApiOrNull();
    if (!api?.detectLocalOpenclaw || !api.restoreFromDirectory || !api.selectOpenclawFolder) {
      setError("Desktop API is not available. Please restart the app.");
      setPageState("error");
      return;
    }

    setPageState("loading");
    setError(null);

    try {
      const detection = await api.detectLocalOpenclaw();

      if (detection.found) {
        // Found local instance — restore directly
        const result = await api.restoreFromDirectory(detection.path);
        if (!result.ok) {
          throw new Error(result.error || "Restore failed");
        }
        void dispatch(setOnboarded(true));
        void navigate(routes.chat, { replace: true });
        return;
      }

      // Not found — open Finder folder picker
      const folderResult = await api.selectOpenclawFolder();
      if (folderResult.cancelled) {
        setPageState("idle");
        return;
      }
      if (!folderResult.ok || !folderResult.path) {
        throw new Error(
          folderResult.error || "Selected folder does not contain a valid OpenClaw configuration."
        );
      }

      // Restore from selected folder
      const restoreResult = await api.restoreFromDirectory(folderResult.path);
      if (!restoreResult.ok) {
        throw new Error(restoreResult.error || "Restore failed");
      }
      void dispatch(setOnboarded(true));
      void navigate(routes.chat, { replace: true });
    } catch (err) {
      setError(errorToMessage(err));
      setPageState("error");
    }
  }, [selected, navigate, dispatch]);

  return (
    <HeroPageLayout
      variant="compact"
      align="center"
      aria-label="Restore option"
      context="onboarding"
    >
      <OnboardingHeader
        totalSteps={props.totalSteps}
        activeStep={props.activeStep}
        onBack={handleBack}
        backDisabled={pageState === "loading"}
      />
      <GlassCard className={`UiGlassCardOnboarding ${s.UiRestoreCard}`}>
        <div className="UiSectionTitle">Choose restore option</div>
        <div className="UiSectionSubtitle">
          Import an existing setup and continue where you left off
        </div>

        <div className="UiProviderList UiListWithScroll scrollable">
          <label
            className={`UiProviderOption ${selected === "local" ? "UiProviderOption--selected" : ""}`}
          >
            <input
              type="radio"
              name="restore-option"
              value="local"
              checked={selected === "local"}
              onChange={() => setSelected("local")}
              className="UiProviderRadio"
            />
            <span className={s.UiRestoreOptionIcon} aria-hidden="true">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 28 28"
                fill="none"
              >
                <path
                  d="M24.4997 18.667V8.40033C24.4997 7.09354 24.4997 6.44014 24.2454 5.94101C24.0217 5.50197 23.6647 5.14501 23.2257 4.92131C22.7265 4.66699 22.0731 4.66699 20.7663 4.66699H7.23301C5.92622 4.66699 5.27282 4.66699 4.7737 4.92131C4.33465 5.14501 3.9777 5.50197 3.75399 5.94101C3.49967 6.44014 3.49967 7.09354 3.49967 8.40033V18.667M5.44412 23.3337H22.5552C23.2785 23.3337 23.6402 23.3337 23.9369 23.2542C24.7421 23.0384 25.3711 22.4095 25.5868 21.6042C25.6663 21.3075 25.6663 20.9459 25.6663 20.2225C25.6663 19.8609 25.6663 19.6801 25.6266 19.5317C25.5187 19.1291 25.2042 18.8146 24.8016 18.7067C24.6533 18.667 24.4724 18.667 24.1108 18.667H3.88856C3.52691 18.667 3.34608 18.667 3.19772 18.7067C2.79511 18.8146 2.48064 19.1291 2.37276 19.5317C2.33301 19.6801 2.33301 19.8609 2.33301 20.2225C2.33301 20.9459 2.33301 21.3075 2.41251 21.6042C2.62827 22.4095 3.25722 23.0384 4.06243 23.2542C4.35915 23.3337 4.72081 23.3337 5.44412 23.3337Z"
                  stroke="currentColor"
                  stroke-width="2.33333"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
            <div className={s.UiRestoreOptionText}>
              <div className={s.UiRestoreOptionName}>Restore from local OpenClaw instance</div>
              <div className={s.UiRestoreOptionDesc}>
                Automatically detect and import an OpenClaw instance on this device.
              </div>
            </div>
          </label>

          <label
            className={`UiProviderOption ${selected === "file" ? "UiProviderOption--selected" : ""}`}
          >
            <input
              type="radio"
              name="restore-option"
              value="file"
              checked={selected === "file"}
              onChange={() => setSelected("file")}
              className="UiProviderRadio"
            />
            <span className={s.UiRestoreOptionIcon} aria-hidden="true">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 28 28"
                fill="none"
              >
                <path
                  d="M15.1663 8.16667L13.8649 5.56374C13.4903 4.8146 13.303 4.44002 13.0236 4.16636C12.7765 3.92435 12.4787 3.7403 12.1518 3.62753C11.782 3.5 11.3632 3.5 10.5257 3.5H6.06634C4.75955 3.5 4.10616 3.5 3.60703 3.75432C3.16799 3.97802 2.81103 4.33498 2.58733 4.77402C2.33301 5.27315 2.33301 5.92654 2.33301 7.23333V8.16667M2.33301 8.16667H20.0663C22.0265 8.16667 23.0066 8.16667 23.7553 8.54814C24.4139 8.8837 24.9493 9.41913 25.2849 10.0777C25.6663 10.8264 25.6663 11.8065 25.6663 13.7667V18.9C25.6663 20.8602 25.6663 21.8403 25.2849 22.589C24.9493 23.2475 24.4139 23.783 23.7553 24.1185C23.0066 24.5 22.0265 24.5 20.0663 24.5H7.93301C5.97282 24.5 4.99273 24.5 4.24404 24.1185C3.58547 23.783 3.05004 23.2475 2.71449 22.589C2.33301 21.8403 2.33301 20.8602 2.33301 18.9V8.16667ZM13.9997 19.8333V12.8333M10.4997 16.3333H17.4997"
                  stroke="currentColor"
                  stroke-width="2.33333"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
            <div className={s.UiRestoreOptionText}>
              <div className={s.UiRestoreOptionName}>Restore from backup file</div>
              <div className={s.UiRestoreOptionDesc}>
                Upload a backup file to restore your OpenClaw configuration.
              </div>
            </div>
          </label>
        </div>

        {pageState === "error" && error ? <div className={s.UiRestoreError}>{error}</div> : null}

        <div className={`UiSkillsBottomRow ${s.UiRestoreCardBottom}`}>
          <div />
          <PrimaryButton
            size="sm"
            onClick={() => void handleContinue()}
            disabled={pageState === "loading"}
            loading={pageState === "loading"}
          >
            Restore now
          </PrimaryButton>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
