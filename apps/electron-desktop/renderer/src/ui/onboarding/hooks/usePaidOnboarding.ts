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
  storeAuthToken,
  authActions,
  fetchAutoTopUpSettings,
  fetchDesktopStatus,
  patchAutoTopUpSettings,
} from "@store/slices/auth/authSlice";
import { upgradePaywallActions } from "@store/slices/upgradePaywallSlice";
import { setOnboarded } from "@store/slices/onboardingSlice";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { backendApi, type SubscriptionPriceInfo } from "@ipc/backendApi";
import { openExternal } from "@shared/utils/openExternal";
import { useDeepLinkAuth } from "@shared/hooks/useDeepLinkAuth";
import { persistDesktopMode } from "../../shared/persistMode";
import { addToastError } from "@shared/toast";

import { routes } from "../../app/routes";

import { usePaidNavigation } from "./usePaidNavigation";
import { usePaidConfig } from "./usePaidConfig";
import { useWelcomeSkillState } from "./useWelcomeSkillState";
import { useWelcomeNotion } from "./useWelcomeNotion";
import { useWelcomeTrello } from "./useWelcomeTrello";
import { useWelcomeGitHub } from "./useWelcomeGitHub";
import { useWelcomeObsidian } from "./useWelcomeObsidian";
import { useWelcomeAppleNotes } from "./useWelcomeAppleNotes";
import { useWelcomeAppleReminders } from "./useWelcomeAppleReminders";
import { useWelcomeWebSearch } from "./useWelcomeWebSearch";
import { useWelcomeMediaUnderstanding } from "./useWelcomeMediaUnderstanding";
import { useWelcomeSlack } from "./useWelcomeSlack";
import { useWelcomeTelegram } from "./useWelcomeTelegram";
import { useWelcomeGog } from "./useWelcomeGog";
import { useWelcomeApiKey } from "./useWelcomeApiKey";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "https://api.atomicbot.ai";
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
  const [authBusy, setAuthBusy] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [payBusy, setPayBusy] = React.useState(false);
  const [payError, setPayError] = React.useState<string | null>(null);
  const [paymentPending, setPaymentPending] = React.useState(false);
  const [alreadySubscribed, setAlreadySubscribed] = React.useState(false);

  const [subscriptionPrice, setSubscriptionPrice] = React.useState<SubscriptionPriceInfo | null>(
    null
  );

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

  // Complex navigation (calls refreshProviderFlags before navigating)
  const goPaidMediaUnderstanding = React.useCallback(() => {
    void refreshProviderFlags();
    void navigate(`${routes.welcome}/media-understanding`);
  }, [navigate, refreshProviderFlags]);

  // ── Skills & Connections state ──

  const skillState = useWelcomeSkillState({ setError: setSkillError, setStatus: setSkillStatus });
  const { skills, markSkillConnected } = skillState;

  const commonDeps = {
    gw,
    loadConfig,
    setError: setSkillError,
    setStatus: setSkillStatus,
  } as const;
  const skillCommon = { ...commonDeps, markSkillConnected, goSkills: nav.goPaidSkills } as const;

  const { onNotionApiKeySubmit } = useWelcomeNotion({
    ...skillCommon,
    run: skillState.runNotion,
  });

  const { onTrelloSubmit } = useWelcomeTrello({
    ...skillCommon,
    run: skillState.runTrello,
  });

  const { onGitHubConnect } = useWelcomeGitHub({
    ...skillCommon,
    run: skillState.runGitHub,
  });

  const obsidian = useWelcomeObsidian({
    ...skillCommon,
    run: skillState.runObsidian,
    goObsidianPage: nav.goPaidObsidianPage,
  });

  const { onAppleNotesCheckAndEnable } = useWelcomeAppleNotes({
    ...skillCommon,
    run: skillState.runAppleNotes,
  });

  const { onAppleRemindersAuthorizeAndEnable } = useWelcomeAppleReminders({
    ...skillCommon,
    run: skillState.runAppleReminders,
  });

  const { onWebSearchSubmit } = useWelcomeWebSearch({
    ...skillCommon,
    run: skillState.runWebSearch,
  });

  const { onMediaUnderstandingSubmit } = useWelcomeMediaUnderstanding({
    gw,
    loadConfig: config.loadConfig,
    setStatus: setSkillStatus,
    run: skillState.runMediaUnderstanding,
    markSkillConnected,
    goSkills: nav.goPaidSkills,
  });

  const { onSlackConnect } = useWelcomeSlack({
    ...commonDeps,
    run: skillState.runSlack,
    markSkillConnected,
    goSlackReturn: nav.goPaidSlackBack,
  });

  const telegram = useWelcomeTelegram({
    ...commonDeps,
    goTelegramUser: nav.goPaidTelegramUser,
    goConnections: nav.goPaidConnections,
  });

  const gog = useWelcomeGog({ gw });

  const { onMediaProviderKeySubmit } = useWelcomeApiKey({
    ...commonDeps,
    loadModels: config.loadModels,
    refreshProviderFlags: config.refreshProviderFlags,
  });

  // ── Flow handlers ──

  const loadSubscriptionPrice = React.useCallback(async () => {
    try {
      const info = await backendApi.getSubscriptionInfo();
      setSubscriptionPrice(info);
    } catch {
      // Non-critical: UI will show a fallback price
    }
  }, []);

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

  const onGoogleAuthSuccess = React.useCallback(
    async (params: { jwt: string; email: string; userId: string; isNewUser: boolean }) => {
      try {
        await dispatch(storeAuthToken(params));

        try {
          const status = await backendApi.getStatus(params.jwt);
          if (status.subscription && status.hasKey) {
            setAlreadySubscribed(true);
          }
        } catch {
          // Status check failed — continue with normal onboarding flow
        }

        await savePlaceholderOpenRouterKey();
        void loadSubscriptionPrice();
        await loadModels();
        goPaidModelSelect();
      } catch (err) {
        setAuthError(String(err));
      } finally {
        setAuthBusy(false);
      }
    },
    [dispatch, savePlaceholderOpenRouterKey, loadSubscriptionPrice, loadModels, goPaidModelSelect]
  );

  const startGoogleAuth = React.useCallback(async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      const url = `${BACKEND_URL}/auth/google/desktop`;
      openExternal(url);
    } catch (err) {
      setAuthError(String(err));
      setAuthBusy(false);
    }
  }, []);

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
    if (alreadySubscribed && jwt) {
      try {
        const keys = await backendApi.getKeys(jwt);
        await onStartChat(keys);
      } catch {
        await onStartChat(null);
      }
      return;
    }
    goSetupReview();
  }, [alreadySubscribed, goSetupReview, jwt, onStartChat]);

  const onPay = React.useCallback(async () => {
    if (!jwt) {
      setPayError("Not authenticated");
      return;
    }

    setPayBusy(true);
    setPayError(null);

    try {
      const result = await backendApi.createSetupCheckout(jwt, {});

      openExternal(result.checkoutUrl);

      setPaymentPending(true);
    } catch (err) {
      setPayError(String(err));
    } finally {
      setPayBusy(false);
    }
  }, [jwt]);

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
      void onGoogleAuthSuccess(params);
    },
    onAuthError: () => {
      setAuthError("Authentication failed — missing token data");
      setAuthBusy(false);
    },
    onStripeSuccess: () => {
      void dispatch(fetchDesktopStatus()).finally(() => {
        dispatch(upgradePaywallActions.close());
        goSuccess();
      });
    },
  });

  return {
    // ── Domain-grouped properties (used directly by WelcomePage routes) ──

    auth: { jwt, busy: authBusy, error: authError, startGoogleAuth, alreadySubscribed },
    pay: {
      busy: payBusy,
      error: payError,
      pending: paymentPending,
      cancelPending: React.useCallback(() => setPaymentPending(false), []),
      onPay,
      subscriptionPrice,
      loadSubscriptionPrice,
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
      goObsidian: obsidian.goObsidian,
    },
    flow: { onPaidConnectionsContinue, onStartChat },

    // ── Skill orchestration ──
    skillStatus,
    skillError,

    // ── Flat FlowSource-compatible properties (passed through to SharedFlowRoutes) ──

    skills,
    markSkillConnected,
    hasOpenAiProvider: config.hasOpenAiProvider,

    notionBusy: skillState.notionBusy,
    trelloBusy: skillState.trelloBusy,
    githubBusy: skillState.githubBusy,
    obsidianBusy: skillState.obsidianBusy,
    appleNotesBusy: skillState.appleNotesBusy,
    appleRemindersBusy: skillState.appleRemindersBusy,
    webSearchBusy: skillState.webSearchBusy,
    mediaUnderstandingBusy: skillState.mediaUnderstandingBusy,
    slackBusy: skillState.slackBusy,

    obsidianVaults: obsidian.obsidianVaults,
    obsidianVaultsLoading: obsidian.obsidianVaultsLoading,
    onObsidianRecheck: obsidian.onObsidianRecheck,
    onObsidianSetDefaultAndEnable: obsidian.onObsidianSetDefaultAndEnable,
    selectedObsidianVaultName: obsidian.selectedObsidianVaultName,
    setSelectedObsidianVaultName: obsidian.setSelectedObsidianVaultName,

    channelsProbe: telegram.channelsProbe,
    onTelegramTokenNext: telegram.onTelegramTokenNext,
    onTelegramUserNext: telegram.onTelegramUserNext,
    setTelegramToken: telegram.setTelegramToken,
    setTelegramUserId: telegram.setTelegramUserId,
    telegramStatus: telegram.telegramStatus,
    telegramToken: telegram.telegramToken,
    telegramUserId: telegram.telegramUserId,

    gogAccount: gog.gogAccount,
    gogBusy: gog.gogBusy,
    gogError: gog.gogError,
    gogOutput: gog.gogOutput,
    onGogAuthAdd: gog.onGogAuthAdd,
    onGogAuthList: gog.onGogAuthList,
    setGogAccount: gog.setGogAccount,

    onNotionApiKeySubmit,
    onTrelloSubmit,
    onGitHubConnect,
    onAppleNotesCheckAndEnable,
    onAppleRemindersAuthorizeAndEnable,
    onWebSearchSubmit,
    onMediaUnderstandingSubmit,
    onMediaProviderKeySubmit,
    onSlackConnect,
  };
}
