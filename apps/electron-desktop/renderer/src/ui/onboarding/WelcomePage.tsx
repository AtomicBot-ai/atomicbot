import React from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { clearAuth } from "@store/slices/auth/authSlice";
import type { GatewayState } from "@main/types";
import { routes } from "../app/routes";
import { GlassCard, HeroPageLayout, PrimaryButton } from "@shared/kit";
import { addToastError } from "@shared/toast";
import { ApiKeyPage } from "./providers/ApiKeyPage";
import { OAuthProviderPage } from "./providers/OAuthProviderPage";
import { SetupModePage } from "./providers/SetupModePage";
import { ModelSelectPage } from "./providers/ModelSelectPage";
import { ProviderSelectPage } from "./providers/ProviderSelectPage";
import { SetupReviewPage } from "./SetupReviewPage";
import { SuccessPage } from "./SuccessPage";
import { RestoreOptionPage } from "./RestoreOptionPage";
import { RestoreFilePage } from "./RestoreFilePage";
import { useWelcomeState } from "./hooks/useWelcomeState";
import { usePaidOnboarding } from "./hooks/usePaidOnboarding";
import { SELF_FLOW, PAID_FLOW, RESTORE_FLOW } from "./hooks/onboardingSteps";
import { OnboardingFlowContext, type OnboardingFlow } from "./hooks/onboarding-flow-context";
import { renderSharedFlowRoutes } from "./SharedFlowRoutes";

function WelcomeAutoStart(props: {
  startBusy: boolean;
  error: string | null;
  onStart: () => void;
}) {
  const didStartRef = React.useRef(false);

  React.useEffect(() => {
    if (didStartRef.current) {
      return;
    }
    didStartRef.current = true;
    props.onStart();
  }, [props.onStart]);

  if (props.startBusy) {
    return null;
  }

  if (props.error) {
    return (
      <HeroPageLayout title="WELCOME" variant="compact" align="center" aria-label="Welcome setup">
        <GlassCard className="UiGlassCard-intro">
          <div className="UiIntroInner">
            <div className="UiSectionTitle">Setup failed.</div>
            <div className="UiSectionSubtitle">Please retry to continue onboarding.</div>
            <PrimaryButton onClick={props.onStart}>Retry</PrimaryButton>
          </div>
        </GlassCard>
      </HeroPageLayout>
    );
  }

  return null;
}

export function WelcomePage({ state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const onboarded = useAppSelector((s) => s.onboarding.onboarded);
  const welcome = useWelcomeState({ state, navigate });
  const paid = usePaidOnboarding({ navigate });

  const [flow, setFlow] = React.useState<OnboardingFlow>("self-managed");

  React.useEffect(() => {
    if (onboarded) {
      void navigate("/chat", { replace: true });
    }
  }, [navigate, onboarded]);

  // ── Flow-dependent values ──
  const steps = flow === "paid" ? PAID_FLOW : SELF_FLOW;
  const fs = flow === "paid" ? paid : welcome;
  const flowStatus = flow === "paid" ? paid.skillStatus : welcome.status;
  const flowError = flow === "paid" ? paid.skillError : welcome.error;

  const skillsOnBack = flow === "paid" ? paid.goPaidModelSelect : welcome.goModelSelect;
  const connectionsFinish = React.useCallback(() => {
    if (flow === "paid") {
      void paid.onPaidConnectionsContinue();
    } else {
      welcome.finish();
    }
  }, [flow, paid.onPaidConnectionsContinue, welcome.finish]);

  const goMediaUnderstanding =
    flow === "paid" ? paid.goPaidMediaUnderstanding : welcome.goMediaUnderstanding;
  const goObsidianConnect = flow === "paid" ? paid.goObsidian : welcome.goObsidian;
  const goSlackFromSkills =
    flow === "paid" ? paid.goPaidSlackFromSkills : welcome.goSlackFromSkills;
  const goSlackFromConnections =
    flow === "paid" ? paid.goPaidSlackFromConnections : welcome.goSlackFromConnections;
  const goSlackBack = flow === "paid" ? paid.goPaidSlackBack : welcome.goSlackBack;

  return (
    <OnboardingFlowContext.Provider value={flow}>
      <Routes>
        <Route
          index
          element={
            <WelcomeAutoStart
              startBusy={welcome.startBusy}
              error={welcome.error}
              onStart={() => {
                void welcome.start();
              }}
            />
          }
        />

        {/* ── Setup mode selection ── */}
        <Route
          path="setup-mode"
          element={
            <SetupModePage
              totalSteps={PAID_FLOW.totalSteps}
              activeStep={PAID_FLOW.steps.auth}
              onSelect={(mode) => {
                if (mode === "paid") {
                  setFlow("paid");
                  void paid.startGoogleAuth();
                } else {
                  setFlow("self-managed");
                  void dispatch(clearAuth());
                  welcome.goProviderSelect();
                }
              }}
              onStartGoogleAuth={() => {
                setFlow("paid");
                void paid.startGoogleAuth();
              }}
              authBusy={paid.authBusy}
              authError={paid.authError}
              onBack={() => void navigate(routes.consent)}
            />
          }
        />

        {/* ── Paid-only routes ── */}
        <Route
          path="paid-model-select"
          element={
            <ModelSelectPage
              totalSteps={PAID_FLOW.totalSteps}
              activeStep={PAID_FLOW.steps.model}
              models={paid.models}
              filterProvider="openrouter"
              loading={paid.modelsLoading}
              error={paid.modelsError}
              onSelect={(modelId) => void paid.onPaidModelSelect(modelId)}
              onBack={paid.goSetupMode}
              onRetry={() => void paid.loadModels()}
            />
          }
        />

        <Route
          path="setup-review"
          element={
            <SetupReviewPage
              totalSteps={PAID_FLOW.totalSteps}
              activeStep={PAID_FLOW.steps.review}
              selectedModel={paid.selectedModelName ?? paid.selectedModel ?? "GPT-5.2 Pro"}
              subscriptionPrice={paid.subscriptionPrice}
              onPay={() => void paid.onPay()}
              onBack={paid.goPaidModelSelect}
              busy={paid.payBusy}
              paymentPending={paid.paymentPending}
              autoTopUp={paid.autoTopUp}
              autoTopUpLoading={paid.autoTopUpLoading}
              autoTopUpSaving={paid.autoTopUpSaving}
              autoTopUpError={paid.autoTopUpError}
              onAutoTopUpPatch={paid.onAutoTopUpPatch}
              onError={addToastError}
            />
          }
        />

        <Route
          path="success"
          element={
            paid.jwt ? (
              <SuccessPage jwt={paid.jwt} onStartChat={(key) => void paid.onStartChat(key)} />
            ) : (
              <Navigate to={`${routes.welcome}/setup-mode`} replace />
            )
          }
        />

        {/* ── Self-managed-only routes ── */}
        <Route
          path="provider-select"
          element={
            <ProviderSelectPage
              totalSteps={SELF_FLOW.totalSteps}
              activeStep={SELF_FLOW.steps.provider}
              selectedProvider={welcome.selectedProvider}
              error={welcome.error}
              onSelect={welcome.onProviderSelect}
              onBack={() => void navigate(`${routes.welcome}/setup-mode`)}
            />
          }
        />

        <Route
          path="api-key"
          element={
            welcome.selectedProvider ? (
              <ApiKeyPage
                totalSteps={SELF_FLOW.totalSteps}
                activeStep={SELF_FLOW.steps.apiKey}
                provider={welcome.selectedProvider}
                status={welcome.status}
                error={welcome.error}
                busy={welcome.apiKeyBusy}
                onSubmit={welcome.onApiKeySubmit}
                onSubmitSetupToken={(token) => void welcome.onSetupTokenSubmit(token)}
                onBack={welcome.goProviderSelect}
              />
            ) : (
              <Navigate to={`${routes.welcome}/provider-select`} replace />
            )
          }
        />

        <Route
          path="oauth-provider"
          element={
            welcome.selectedProvider ? (
              <OAuthProviderPage
                totalSteps={SELF_FLOW.totalSteps}
                activeStep={SELF_FLOW.steps.apiKey}
                provider={welcome.selectedProvider}
                onSuccess={(profileId) => void welcome.onOAuthSuccess(profileId)}
                onBack={welcome.goProviderSelect}
              />
            ) : (
              <Navigate to={`${routes.welcome}/provider-select`} replace />
            )
          }
        />

        <Route
          path="model-select"
          element={
            <ModelSelectPage
              totalSteps={SELF_FLOW.totalSteps}
              activeStep={SELF_FLOW.steps.model}
              models={welcome.models}
              filterProvider={welcome.selectedProvider ?? undefined}
              loading={welcome.modelsLoading}
              error={welcome.modelsError}
              onSelect={(modelId) => void welcome.onModelSelect(modelId)}
              onBack={welcome.goApiKey}
              onRetry={() => void welcome.loadModels()}
            />
          }
        />

        {/* ── Unified shared routes (skills, connections, skill subpages) ── */}
        {renderSharedFlowRoutes({
          fs,
          steps,
          flowStatus,
          flowError,
          nav: {
            goSkills: welcome.goSkills,
            goConnections: welcome.goConnections,
            goWebSearch: welcome.goWebSearch,
            goNotion: welcome.goNotion,
            goTrello: welcome.goTrello,
            goGitHub: welcome.goGitHub,
            goAppleNotes: welcome.goAppleNotes,
            goAppleReminders: welcome.goAppleReminders,
            goGogGoogleWorkspace: welcome.goGogGoogleWorkspace,
            goTelegramToken: welcome.goTelegramToken,
            goMediaUnderstanding,
            goObsidianConnect,
            goSlackFromSkills,
            goSlackFromConnections,
            goSlackBack,
            skillsOnBack,
            connectionsFinish,
          },
        })}

        <Route
          path="restore"
          element={
            <RestoreOptionPage
              totalSteps={RESTORE_FLOW.totalSteps}
              activeStep={RESTORE_FLOW.steps.option}
            />
          }
        />
        <Route
          path="restore-file"
          element={
            <RestoreFilePage
              totalSteps={RESTORE_FLOW.totalSteps}
              activeStep={RESTORE_FLOW.steps.file}
            />
          }
        />

        <Route path="*" element={<Navigate to={routes.welcome} replace />} />
      </Routes>
    </OnboardingFlowContext.Provider>
  );
}
