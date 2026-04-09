/**
 * Declarative route definitions for the onboarding WelcomePage.
 * Each render function returns Route elements for a specific onboarding flow.
 */
import React from "react";
import { Navigate, Route } from "react-router-dom";
import type { AppDispatch } from "@store/store";
import { switchMode } from "@store/slices/auth/mode-switch";
import { startLlamacppServer } from "@store/slices/llamacppSlice";
import { applyLocalModelConfig } from "@store/slices/llamacpp-config";
import { resetSessionModelSelection } from "@store/slices/session-model-reset";
import { reloadConfig } from "@store/slices/configSlice";
import { clearAuth } from "@store/slices/auth/authSlice";
import { routes } from "../app/routes";
import { PAID_FLOW, SELF_FLOW, LOCAL_MODEL_FLOW, RESTORE_FLOW } from "./hooks/onboardingSteps";
import { resolveModelSelectBackTarget } from "./hooks/resolve-model-select-back-target";
import { ApiKeyPage } from "./providers/ApiKeyPage";
import { OAuthProviderPage } from "./providers/OAuthProviderPage";
import { OllamaSetupPage } from "./providers/OllamaSetupPage";
import { SetupModePage } from "./providers/SetupModePage";
import { LocalBackendSetupPage } from "./providers/LocalBackendSetupPage";
import { LocalModelSelectPage } from "./providers/LocalModelSelectPage";
import { ModelSelectPage } from "./providers/ModelSelectPage";
import { ProviderSelectPage } from "./providers/ProviderSelectPage";
import { RestoreOptionPage } from "./RestoreOptionPage";
import { RestoreFilePage } from "./RestoreFilePage";
import type { OnboardingFlow } from "./hooks/onboarding-flow-context";

import type { useWelcomeState } from "./hooks/useWelcomeState";
import type { usePaidOnboarding } from "./hooks/usePaidOnboarding";

type WelcomeHook = ReturnType<typeof useWelcomeState>;
type PaidHook = ReturnType<typeof usePaidOnboarding>;

export type WelcomeRouteDeps = {
  welcome: WelcomeHook;
  paid: PaidHook;
  dispatch: AppDispatch;
  navigate: (path: string, opts?: { replace?: boolean }) => void;
  gw: { request: <T = unknown>(method: string, params?: unknown) => Promise<T> };
  isMac: boolean;
  flow: OnboardingFlow;
  setFlow: (flow: OnboardingFlow) => void;
};

export function renderSetupModeRoute(deps: WelcomeRouteDeps): React.ReactNode {
  const { welcome, paid, dispatch, navigate, isMac, setFlow } = deps;
  return (
    <Route
      path="setup-mode"
      element={
        <SetupModePage
          totalSteps={PAID_FLOW.totalSteps}
          activeStep={PAID_FLOW.steps.auth}
          localModelComingSoon={!isMac}
          onSelect={(mode) => {
            if (mode === "paid") {
              setFlow("paid");
              void paid.auth.startGoogleAuth();
            } else if (mode === "local-model") {
              setFlow("local-model");
              void navigate(`${routes.welcome}/local-backend-setup`);
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
  );
}

export function renderPaidRoutes(deps: WelcomeRouteDeps): React.ReactNode {
  const { paid } = deps;
  return (
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
  );
}

export function renderLocalModelRoutes(deps: WelcomeRouteDeps): React.ReactNode {
  const { welcome, dispatch, navigate, gw } = deps;
  return (
    <>
      <Route
        path="local-backend-setup"
        element={
          <LocalBackendSetupPage
            totalSteps={LOCAL_MODEL_FLOW.totalSteps}
            activeStep={LOCAL_MODEL_FLOW.steps.backendDownload}
            onContinue={() => void navigate(`${routes.welcome}/local-model-select`)}
            onBack={() => void navigate(`${routes.welcome}/setup-mode`)}
          />
        }
      />

      <Route
        path="local-model-select"
        element={
          <LocalModelSelectPage
            totalSteps={LOCAL_MODEL_FLOW.totalSteps}
            activeStep={LOCAL_MODEL_FLOW.steps.modelSelect}
            onSelect={async (modelId) => {
              const serverResult = await dispatch(startLlamacppServer(modelId)).unwrap();
              if (gw) {
                await dispatch(
                  switchMode({
                    request: gw.request,
                    target: "local-model",
                    modelId: serverResult?.modelId,
                    modelName: serverResult?.modelName,
                    contextLength: serverResult?.contextLength,
                  })
                ).unwrap();

                const cfgModelId = serverResult?.modelId ?? modelId;
                const cfgModelName = serverResult?.modelName ?? "Local Model";
                const maxAttempts = 6;
                for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                  try {
                    await applyLocalModelConfig({
                      request: gw.request,
                      modelId: cfgModelId,
                      modelName: cfgModelName,
                      contextLength: serverResult?.contextLength,
                    });
                    await gw
                      .request("secrets.reload", {})
                      .catch((err) => console.warn("[onboarding] secrets.reload:", err));
                    await resetSessionModelSelection(gw.request);
                    break;
                  } catch (retryErr) {
                    const msg = String(retryErr);
                    const isRestart =
                      msg.includes("1012") ||
                      msg.includes("service restart") ||
                      msg.includes("gateway closed") ||
                      msg.includes("did not persist");
                    if (!isRestart || attempt === maxAttempts) throw retryErr;
                    await new Promise((r) => setTimeout(r, 800 * attempt));
                  }
                }

                await dispatch(reloadConfig({ request: gw.request }))
                  .unwrap()
                  .catch((err) => console.warn("[onboarding] reloadConfig:", err));
              }
              welcome.goSkills();
            }}
            onContinue={welcome.goSkills}
            onBack={() => void navigate(`${routes.welcome}/setup-mode`)}
          />
        }
      />
    </>
  );
}

export function renderSelfManagedRoutes(deps: WelcomeRouteDeps): React.ReactNode {
  const { welcome, navigate } = deps;

  const selfManagedModelSelectBack =
    resolveModelSelectBackTarget(welcome.selectedProvider) === "ollama-setup"
      ? welcome.goOllamaSetup
      : welcome.goApiKey;
  const selfManagedModelSelectRetry =
    welcome.selectedProvider === "ollama" ? welcome.retryOllamaSubmit : welcome.loadModels;

  return (
    <>
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
        path="ollama-setup"
        element={
          <OllamaSetupPage
            totalSteps={SELF_FLOW.totalSteps}
            activeStep={SELF_FLOW.steps.apiKey}
            busy={welcome.apiKeyBusy}
            error={welcome.error}
            onSubmit={(params) => void welcome.onOllamaSubmit(params)}
            onBack={welcome.goProviderSelect}
          />
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
            onBack={selfManagedModelSelectBack}
            onRetry={() => void selfManagedModelSelectRetry()}
            onSkip={welcome.goSkills}
          />
        }
      />
    </>
  );
}

export function renderRestoreRoutes(): React.ReactNode {
  return (
    <>
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
    </>
  );
}
