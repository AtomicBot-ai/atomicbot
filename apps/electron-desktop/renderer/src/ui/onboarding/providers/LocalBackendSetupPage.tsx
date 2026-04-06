import React from "react";

import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  downloadLlamacppBackend,
  cancelLlamacppBackendDownload,
  fetchLlamacppBackendStatus,
} from "@store/slices/llamacppSlice";
import { GlassCard, HeroPageLayout, SecondaryButton } from "@shared/kit";
import { OnboardingHeader } from "../OnboardingHeader";

export function LocalBackendSetupPage(props: {
  totalSteps: number;
  activeStep: number;
  onContinue: () => void;
  onBack: () => void;
}) {
  const dispatch = useAppDispatch();
  const backendDownloaded = useAppSelector((s) => s.llamacpp.backendDownloaded);
  const backendDownload = useAppSelector((s) => s.llamacpp.backendDownload);
  const startedRef = React.useRef(false);
  const autoContinuedRef = React.useRef(false);

  // On mount: check status, then auto-start download if needed
  React.useEffect(() => {
    void (async () => {
      const status = await dispatch(fetchLlamacppBackendStatus()).unwrap();
      if (status?.downloaded) return;
      if (!startedRef.current) {
        startedRef.current = true;
        void dispatch(downloadLlamacppBackend());
      }
    })();
  }, [dispatch]);

  // Auto-continue once download completes
  const isDone = backendDownloaded || backendDownload.kind === "done";
  React.useEffect(() => {
    if (isDone && !autoContinuedRef.current) {
      autoContinuedRef.current = true;
      props.onContinue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when isDone or onContinue changes
  }, [isDone, props.onContinue]);

  const handleCancel = React.useCallback(() => {
    void dispatch(cancelLlamacppBackendDownload());
  }, [dispatch]);

  const handleRetry = React.useCallback(() => {
    void dispatch(downloadLlamacppBackend());
  }, [dispatch]);

  const isDownloading = backendDownload.kind === "downloading";

  return (
    <HeroPageLayout variant="compact" align="center" aria-label="Local backend setup" context="onboarding">
      <OnboardingHeader
        totalSteps={props.totalSteps}
        activeStep={props.activeStep}
        onBack={props.onBack}
      />
      <GlassCard className="UiGlassCardOnboarding">
        <div className="UiSectionContent">
          <div>
            <div className="UiSectionTitle">Setting up AI Engine</div>
            <div className="UiSectionSubtitle">
              Downloading the local inference engine (llama.cpp) to run models on your Mac.
            </div>
          </div>

          {isDownloading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 14, color: "var(--muted3)" }}>
                Downloading... {backendDownload.percent}%
              </div>
              <div
                style={{
                  width: "100%",
                  height: 6,
                  borderRadius: 3,
                  background: "var(--surface-overlay)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${backendDownload.percent}%`,
                    height: "100%",
                    background: "var(--lime)",
                    borderRadius: 3,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <SecondaryButton size="sm" onClick={handleCancel}>
                Cancel
              </SecondaryButton>
            </div>
          )}

          {backendDownload.kind === "error" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ color: "var(--error)", fontSize: 13 }}>{backendDownload.message}</div>
              <SecondaryButton size="sm" onClick={handleRetry}>
                Retry
              </SecondaryButton>
            </div>
          )}
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
