import React from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import type { GatewayState } from "@main/types";
import { routes } from "../app/routes";
import { useGatewayRpc } from "@gateway/context";
import { GlassCard, HeroPageLayout, PrimaryButton } from "@shared/kit";
import { addToastError } from "@shared/toast";
import { useWelcomeState } from "./hooks/useWelcomeState";
import { usePaidOnboarding } from "./hooks/usePaidOnboarding";
import { SELF_FLOW, PAID_FLOW, LOCAL_MODEL_FLOW } from "./hooks/onboardingSteps";
import { OnboardingFlowContext, type OnboardingFlow } from "./hooks/onboarding-flow-context";
import { renderSharedFlowRoutes } from "./SharedFlowRoutes";
import {
  renderSetupModeRoute,
  renderPaidRoutes,
  renderLocalModelRoutes,
  renderSelfManagedRoutes,
  renderRestoreRoutes,
} from "./welcome-routes";

function WelcomeAutoStart(props: {
  startBusy: boolean;
  error: string | null;
  onStart: () => void;
}) {
  const { startBusy, error, onStart } = props;
  const didStartRef = React.useRef(false);

  React.useEffect(() => {
    if (didStartRef.current) {
      return;
    }
    didStartRef.current = true;
    onStart();
  }, [onStart]);

  if (startBusy) {
    return null;
  }

  if (error) {
    return (
      <HeroPageLayout title="WELCOME" variant="compact" align="center" aria-label="Welcome setup">
        <GlassCard className="UiGlassCard-intro">
          <div className="UiIntroInner">
            <div className="UiSectionTitle">Setup failed.</div>
            <div className="UiSectionSubtitle">Please retry to continue onboarding.</div>
            <PrimaryButton onClick={onStart}>Retry</PrimaryButton>
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
  const gw = useGatewayRpc();

  const [flow, setFlow] = React.useState<OnboardingFlow>("self-managed");

  React.useEffect(() => {
    if (onboarded) {
      void navigate("/chat", { replace: true });
    }
  }, [navigate, onboarded]);

  const isMac = (getDesktopApiOrNull()?.platform ?? "darwin") === "darwin";

  // ── Flow-dependent values ──
  const steps = flow === "paid" ? PAID_FLOW : flow === "local-model" ? LOCAL_MODEL_FLOW : SELF_FLOW;
  const fs = flow === "paid" ? paid : welcome;
  const flowStatus = flow === "paid" ? paid.skillStatus : welcome.status;
  const flowError = flow === "paid" ? paid.skillError : welcome.error;
  const onPaidConnectionsContinue = paid.flow.onPaidConnectionsContinue;
  const finishWelcome = welcome.finish;

  const skillsOnBack =
    flow === "paid"
      ? paid.nav.goPaidModelSelect
      : flow === "local-model"
        ? () => void navigate(`${routes.welcome}/local-model-select`)
        : welcome.goModelSelect;
  const connectionsFinish = React.useCallback(() => {
    if (flow === "paid") {
      void onPaidConnectionsContinue();
    } else {
      finishWelcome();
    }
  }, [finishWelcome, flow, onPaidConnectionsContinue]);

  const goMediaUnderstanding =
    flow === "paid" ? paid.nav.goPaidMediaUnderstanding : welcome.goMediaUnderstanding;
  const goObsidianConnect = flow === "paid" ? paid.nav.goObsidian : welcome.goObsidian;
  const goSlackFromSkills =
    flow === "paid" ? paid.nav.goPaidSlackFromSkills : welcome.goSlackFromSkills;
  const goSlackFromConnections =
    flow === "paid" ? paid.nav.goPaidSlackFromConnections : welcome.goSlackFromConnections;
  const goSlackBack = flow === "paid" ? paid.nav.goPaidSlackBack : welcome.goSlackBack;

  const routeDeps = { welcome, paid, dispatch, navigate, gw, isMac, flow, setFlow };

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

        {renderSetupModeRoute(routeDeps)}
        {renderPaidRoutes(routeDeps)}
        {renderLocalModelRoutes(routeDeps)}
        {renderSelfManagedRoutes(routeDeps)}

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

        {renderRestoreRoutes()}

        <Route path="*" element={<Navigate to={routes.welcome} replace />} />
      </Routes>
    </OnboardingFlowContext.Provider>
  );
}
