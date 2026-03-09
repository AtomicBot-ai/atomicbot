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

  const skillsOnBack = flow === "paid" ? paid.nav.goPaidModelSelect : welcome.goModelSelect;
  const connectionsFinish = React.useCallback(() => {
    if (flow === "paid") {
      void paid.flow.onPaidConnectionsContinue();
    } else {
      welcome.finish();
    }
  }, [flow, paid.flow.onPaidConnectionsContinue, welcome.finish]);

  const goMediaUnderstanding =
    flow === "paid" ? paid.nav.goPaidMediaUnderstanding : welcome.goMediaUnderstanding;
  const goObsidianConnect = flow === "paid" ? paid.nav.goObsidian : welcome.goObsidian;
  const goSlackFromSkills =
    flow === "paid" ? paid.nav.goPaidSlackFromSkills : welcome.goSlackFromSkills;
  const goSlackFromConnections =
    flow === "paid" ? paid.nav.goPaidSlackFromConnections : welcome.goSlackFromConnections;
  const goSlackBack = flow === "paid" ? paid.nav.goPaidSlackBack : welcome.goSlackBack;

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
                  void paid.auth.startGoogleAuth();
                } else {
                  setFlow("self-managed");
                  void dispatch(clearAuth());
                  welcome.goProviderSelect();
                }
              }}
              onStartGoogleAuth={() => {
                setFlow("paid");
                void paid.auth.startGoogleAuth();
              }}
              authBusy={paid.auth.busy}
              authError={paid.auth.error}
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
              models={paid.model.models}
              filterProvider="openrouter"
              defaultModelId="gemini-3-flash-preview"
              loading={paid.model.modelsLoading}
              error={paid.model.modelsError}
              onSelect={(modelId) => void paid.model.onSelect(modelId)}
              onBack={paid.nav.goSetupMode}
              onRetry={() => void paid.model.loadModels()}
            />
          }
        />

        <Route
          path="setup-review"
          element={
            <SetupReviewPage
              totalSteps={PAID_FLOW.totalSteps}
              activeStep={PAID_FLOW.steps.review}
              selectedModel={paid.model.selectedName ?? paid.model.selected ?? "GPT-5.2 Pro"}
              subscriptionPrice={paid.pay.subscriptionPrice}
              onPay={() => void paid.pay.onPay()}
              onBack={paid.nav.goPaidModelSelect}
              onCancelPayment={paid.pay.cancelPending}
              busy={paid.pay.busy}
              paymentPending={paid.pay.pending}
              autoTopUp={paid.billing.autoTopUp}
              autoTopUpLoading={paid.billing.autoTopUpLoading}
              autoTopUpSaving={paid.billing.autoTopUpSaving}
              autoTopUpError={paid.billing.autoTopUpError}
              onAutoTopUpPatch={paid.billing.onAutoTopUpPatch}
              onError={addToastError}
            />
          }
        />

        <Route
          path="success"
          element={
            paid.auth.jwt ? (
              <SuccessPage
                jwt={paid.auth.jwt}
                onStartChat={(key) => void paid.flow.onStartChat(key)}
              />
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
              onSkip={welcome.goSkills}
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
              onSkip={welcome.goSkills}
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
