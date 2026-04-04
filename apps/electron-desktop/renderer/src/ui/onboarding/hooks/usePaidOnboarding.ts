/**
 * State orchestrator for the paid "Do everything for me" onboarding flow.
 * Manages: Google OAuth -> model select -> skills -> connections ->
 *          setup review -> Stripe subscription -> success.
 *
 * Navigation lives in usePaidNavigation; gateway config helpers in usePaidConfig.
 */
import React from "react";
import type { NavigateFunction } from "react-router-dom";

import { useGatewayRpc } from "@gateway/context";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  authActions,
  fetchAutoTopUpSettings,
  fetchDesktopStatus,
  patchAutoTopUpSettings,
} from "@store/slices/auth/authSlice";
import { upgradePaywallActions } from "@store/slices/upgradePaywallSlice";
import { setOnboarded } from "@store/slices/onboardingSlice";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { backendApi } from "@ipc/backendApi";
import { useDeepLinkAuth } from "@shared/hooks/useDeepLinkAuth";
import { persistDesktopMode } from "../../shared/persistMode";
import { addToastError } from "@shared/toast";

import { routes } from "../../app/routes";

import { usePaidNavigation } from "./usePaidNavigation";
import { usePaidConfig } from "./usePaidConfig";
import { useSharedOnboardingSkills } from "./useSharedOnboardingSkills";
import { usePaidGoogleAuth } from "./usePaidGoogleAuth";
import { usePaidCheckout } from "./usePaidCheckout";

type BackendKeys = { openrouterApiKey: string | null; openaiApiKey: string | null };

type PaidOnboardingInput = {
  navigate: NavigateFunction;
};

export function usePaidOnboarding({ navigate }: PaidOnboardingInput) {
  const dispatch = useAppDispatch();
  const gw = useGatewayRpc();
  const jwt = useAppSelector((s) => s.auth.jwt);
  const { autoTopUp, autoTopUpLoading, autoTopUpSaving, autoTopUpError, autoTopUpLoaded } =
    useAppSelector((s) => s.auth);

  const [selectedModel, setSelectedModel] = React.useState<string | null>(null);
  const [selectedModelName, setSelectedModelName] = React.useState<string | null>(null);

  const [skillStatus, setSkillStatus] = React.useState<string | null>(null);
  const [skillError, setSkillErrorState] = React.useState<string | null>(null);
  const setSkillError = React.useCallback((value: string | null) => {
    if (value) addToastError(value);
    setSkillErrorState(value);
  }, []);

  // ── Composed hooks ──

  const nav = usePaidNavigation({ navigate });
  const config = usePaidConfig({ gw });
  const { refreshProviderFlags, loadConfig, savePlaceholderOpenRouterKey, loadModels } = config;
  const { models, saveDefaultModel } = config;
  const { goPaidModelSelect, goPaidSkills, goSetupReview, goSuccess } = nav;

  const checkout = usePaidCheckout(jwt);

  const onAuthSuccess = React.useCallback(async () => {
    await savePlaceholderOpenRouterKey();
    void checkout.loadSubscriptionPrice();
    await loadModels();
    goPaidModelSelect();
  }, [savePlaceholderOpenRouterKey, checkout.loadSubscriptionPrice, loadModels, goPaidModelSelect]);

  const googleAuth = usePaidGoogleAuth({ onAuthSuccess });

  const goPaidMediaUnderstanding = React.useCallback(() => {
    void refreshProviderFlags();
    void navigate(`${routes.welcome}/media-understanding`);
  }, [navigate, refreshProviderFlags]);

  // ── Shared skill/connection composition ──

  const shared = useSharedOnboardingSkills({
    gw,
    loadConfig,
    setError: setSkillError,
    setStatus: setSkillStatus,
    loadModels,
    refreshProviderFlags,
    goSkills: nav.goPaidSkills,
    goObsidianPage: nav.goPaidObsidianPage,
    goSlackReturn: nav.goPaidSlackBack,
    goTelegramUser: nav.goPaidTelegramUser,
    goConnections: nav.goPaidConnections,
  });

  // ── Flow handlers ──

  const onStartChat = React.useCallback(
    async (keys: BackendKeys | null) => {
      const api = getDesktopApiOrNull();
      if (api?.setApiKey) {
        if (keys?.openrouterApiKey) {
          await api.setApiKey("openrouter", keys.openrouterApiKey);
        }
        if (keys?.openaiApiKey) {
          await api.setApiKey("openai", keys.openaiApiKey);
        }
      }

      const profiles: Record<string, { provider: string; mode: "api_key" }> = {};
      const order: Record<string, string[]> = {};
      if (keys?.openrouterApiKey) {
        profiles["openrouter:default"] = { provider: "openrouter", mode: "api_key" };
        order.openrouter = ["openrouter:default"];
      }
      if (keys?.openaiApiKey) {
        profiles["openai:default"] = { provider: "openai", mode: "api_key" };
        order.openai = ["openai:default"];
      }
      if (Object.keys(profiles).length > 0) {
        const snap = await loadConfig();
        const baseHash =
          typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
        if (!baseHash) {
          throw new Error("Config base hash missing. Reload and try again.");
        }
        await gw.request("config.patch", {
          baseHash,
          raw: JSON.stringify({ auth: { profiles, order } }, null, 2),
          note: "Welcome: apply backend-provided provider profiles",
        });
      }

      dispatch(authActions.setMode("paid"));
      persistDesktopMode("paid");
      void dispatch(setOnboarded(true));
      void dispatch(fetchDesktopStatus());
      void navigate(routes.chat, { replace: true });
    },
    [dispatch, gw, loadConfig, navigate]
  );

  const onPaidModelSelect = React.useCallback(
    async (modelId: string) => {
      setSelectedModel(modelId);
      const actualId = modelId.includes("/") ? modelId.slice(modelId.indexOf("/") + 1) : modelId;
      const entry = models.find((m) => m.id === modelId || m.id === actualId);
      setSelectedModelName(entry?.name ?? null);
      await saveDefaultModel(modelId);
      goPaidSkills();
    },
    [goPaidSkills, models, saveDefaultModel]
  );

  const onPaidConnectionsContinue = React.useCallback(async () => {
    if (googleAuth.alreadySubscribed && jwt) {
      try {
        const keys = await backendApi.getKeys(jwt);
        await onStartChat(keys);
      } catch {
        await onStartChat(null);
      }
      return;
    }
    goSetupReview();
  }, [googleAuth.alreadySubscribed, goSetupReview, jwt, onStartChat]);

  React.useEffect(() => {
    if (!jwt || autoTopUpLoaded || autoTopUpLoading) {
      return;
    }
    void dispatch(fetchAutoTopUpSettings());
  }, [autoTopUpLoaded, autoTopUpLoading, dispatch, jwt]);

  const onAutoTopUpPatch = React.useCallback(
    async (payload: {
      enabled?: boolean;
      thresholdUsd?: number;
      topupAmountUsd?: number;
      monthlyCapUsd?: number | null;
    }) => {
      await dispatch(patchAutoTopUpSettings(payload)).unwrap();
    },
    [dispatch]
  );

  useDeepLinkAuth({
    onAuth: (params) => {
      void googleAuth.onGoogleAuthSuccess(params);
    },
    onAuthError: googleAuth.onAuthError,
    onStripeSuccess: () => {
      void dispatch(fetchDesktopStatus()).finally(() => {
        dispatch(upgradePaywallActions.close());
        goSuccess();
      });
    },
  });

  return {
    // ── Domain-grouped properties (used directly by WelcomePage routes) ──

    auth: {
      jwt,
      busy: googleAuth.authBusy,
      error: googleAuth.authError,
      startGoogleAuth: googleAuth.startGoogleAuth,
      alreadySubscribed: googleAuth.alreadySubscribed,
    },
    pay: {
      busy: checkout.payBusy,
      error: checkout.payError,
      pending: checkout.paymentPending,
      cancelPending: checkout.cancelPending,
      onPay: checkout.onPay,
      subscriptionPrice: checkout.subscriptionPrice,
      loadSubscriptionPrice: checkout.loadSubscriptionPrice,
    },
    model: {
      selected: selectedModel,
      selectedName: selectedModelName,
      models: config.models,
      modelsLoading: config.modelsLoading,
      modelsError: config.modelsError,
      loadModels: config.loadModels,
      onSelect: onPaidModelSelect,
    },
    billing: { autoTopUp, autoTopUpLoading, autoTopUpSaving, autoTopUpError, onAutoTopUpPatch },
    nav: {
      goSetupMode: nav.goSetupMode,
      goPaidModelSelect: nav.goPaidModelSelect,
      goSetupReview: nav.goSetupReview,
      goSuccess: nav.goSuccess,
      goPaidMediaUnderstanding,
      goPaidSlackFromSkills: nav.goPaidSlackFromSkills,
      goPaidSlackFromConnections: nav.goPaidSlackFromConnections,
      goPaidSlackBack: nav.goPaidSlackBack,
      goObsidian: shared.goObsidian,
    },
    flow: { onPaidConnectionsContinue, onStartChat },

    // ── Skill orchestration ──
    skillStatus,
    skillError,

    // ── Flat FlowSource-compatible properties (passed through to SharedFlowRoutes) ──

    skills: shared.skills,
    markSkillConnected: shared.markSkillConnected,
    hasOpenAiProvider: config.hasOpenAiProvider,

    notionBusy: shared.notionBusy,
    trelloBusy: shared.trelloBusy,
    githubBusy: shared.githubBusy,
    obsidianBusy: shared.obsidianBusy,
    appleNotesBusy: shared.appleNotesBusy,
    appleRemindersBusy: shared.appleRemindersBusy,
    webSearchBusy: shared.webSearchBusy,
    mediaUnderstandingBusy: shared.mediaUnderstandingBusy,
    slackBusy: shared.slackBusy,

    obsidianVaults: shared.obsidianVaults,
    obsidianVaultsLoading: shared.obsidianVaultsLoading,
    onObsidianRecheck: shared.onObsidianRecheck,
    onObsidianSetDefaultAndEnable: shared.onObsidianSetDefaultAndEnable,
    selectedObsidianVaultName: shared.selectedObsidianVaultName,
    setSelectedObsidianVaultName: shared.setSelectedObsidianVaultName,

    channelsProbe: shared.channelsProbe,
    onTelegramTokenNext: shared.onTelegramTokenNext,
    onTelegramUserNext: shared.onTelegramUserNext,
    setTelegramToken: shared.setTelegramToken,
    setTelegramUserId: shared.setTelegramUserId,
    telegramStatus: shared.telegramStatus,
    telegramToken: shared.telegramToken,
    telegramUserId: shared.telegramUserId,

    gogAccount: shared.gogAccount,
    gogBusy: shared.gogBusy,
    gogError: shared.gogError,
    gogOutput: shared.gogOutput,
    gogCredentialsSet: shared.gogCredentialsSet,
    gogCredentialsBusy: shared.gogCredentialsBusy,
    gogCredentialsError: shared.gogCredentialsError,
    onGogAuthAdd: shared.onGogAuthAdd,
    onGogAuthList: shared.onGogAuthList,
    onGogSetCredentials: shared.onGogSetCredentials,
    setGogAccount: shared.setGogAccount,

    onNotionApiKeySubmit: shared.onNotionApiKeySubmit,
    onTrelloSubmit: shared.onTrelloSubmit,
    onGitHubConnect: shared.onGitHubConnect,
    onAppleNotesCheckAndEnable: shared.onAppleNotesCheckAndEnable,
    onAppleRemindersAuthorizeAndEnable: shared.onAppleRemindersAuthorizeAndEnable,
    onWebSearchSubmit: shared.onWebSearchSubmit,
    onMediaUnderstandingSubmit: shared.onMediaUnderstandingSubmit,
    onMediaProviderKeySubmit: shared.onMediaProviderKeySubmit,
    onSlackConnect: shared.onSlackConnect,
  };
}
