import React from "react";
import type { NavigateFunction } from "react-router-dom";
import { useGatewayRpc } from "@gateway/context";
import { captureRenderer, ANALYTICS_EVENTS } from "@analytics";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { useAppDispatch } from "@store/hooks";
import { setOnboarded } from "@store/slices/onboardingSlice";
import { authActions } from "@store/slices/auth/authSlice";
import { persistDesktopMode } from "../../shared/persistMode";
import type { GatewayState } from "@main/types";
import { routes } from "../../app/routes";
import type { Provider } from "../providers/ProviderSelectPage";
import { MODEL_PROVIDER_BY_ID } from "@shared/models/providers";
import { setVoiceProvider } from "../../chat/hooks/useVoiceInput";
import { useWelcomeApiKey } from "./useWelcomeApiKey";
import { useWelcomeAppleNotes } from "./useWelcomeAppleNotes";
import { useWelcomeAppleReminders } from "./useWelcomeAppleReminders";
import { useWelcomeConfig } from "./useWelcomeConfig";
import { useWelcomeGitHub } from "./useWelcomeGitHub";
import { useWelcomeGog } from "./useWelcomeGog";
import { useWelcomeMediaUnderstanding } from "./useWelcomeMediaUnderstanding";
import { useWelcomeModels } from "./useWelcomeModels";
import { useWelcomeNavigation } from "./useWelcomeNavigation";
import { useWelcomeNotion } from "./useWelcomeNotion";
import { useWelcomeObsidian } from "./useWelcomeObsidian";
import { useWelcomeSkillState } from "./useWelcomeSkillState";
import { useWelcomeSlack } from "./useWelcomeSlack";
import { useWelcomeTelegram } from "./useWelcomeTelegram";
import { useWelcomeTrello } from "./useWelcomeTrello";
import { useWelcomeWebSearch } from "./useWelcomeWebSearch";
import { addToastError, errorToMessage } from "@shared/toast";
import { patchAuthProfile } from "../../shared/utils/authProfiles";

type WelcomeStateInput = {
  state: Extract<GatewayState, { kind: "ready" }>;
  navigate: NavigateFunction;
};

type OllamaSetupParams = {
  baseUrl: string;
  apiKey: string;
  mode: "local" | "cloud";
};

export function useWelcomeState({ state, navigate }: WelcomeStateInput) {
  const gw = useGatewayRpc();
  const dispatch = useAppDispatch();

  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setErrorState] = React.useState<string | null>(null);
  const setError = React.useCallback((value: string | null) => {
    if (value) {
      addToastError(value);
    }
    setErrorState(value);
  }, []);

  const [selectedProvider, setSelectedProvider] = React.useState<Provider | null>(null);
  const [apiKeyBusy, setApiKeyBusy] = React.useState(false);
  const [savedOllamaParams, setSavedOllamaParams] = React.useState<OllamaSetupParams | null>(null);

  // --- Composed hooks ---

  const skillState = useWelcomeSkillState({ setError, setStatus });
  const { skills, markSkillConnected } = skillState;

  const nav = useWelcomeNavigation(navigate);
  const { goApiKey, goOAuthProvider, goOllamaSetup, goModelSelect } = nav;

  const goSetupMode = React.useCallback(() => {
    void navigate(`${routes.welcome}/setup-mode`);
  }, [navigate]);

  const config = useWelcomeConfig({
    gw,
    state,
    setError,
    setStatus,
    goProviderSelect: nav.goProviderSelect,
    goSetupMode,
  });
  const { loadConfig, refreshProviderFlags } = config;

  // Shared deps passed to most domain hooks.
  const commonDeps = { gw, loadConfig, setError, setStatus } as const;
  const skillCommon = { ...commonDeps, markSkillConnected, goSkills: nav.goSkills } as const;

  const { loadModels, models, modelsError, modelsLoading, onModelSelect } = useWelcomeModels({
    ...commonDeps,
    goSkills: nav.goSkills,
  });

  const { saveApiKey, saveSetupToken, onMediaProviderKeySubmit } = useWelcomeApiKey({
    ...commonDeps,
    loadModels,
    refreshProviderFlags,
  });

  const { onAppleNotesCheckAndEnable } = useWelcomeAppleNotes({
    ...skillCommon,
    run: skillState.runAppleNotes,
  });
  const { onAppleRemindersAuthorizeAndEnable } = useWelcomeAppleReminders({
    ...skillCommon,
    run: skillState.runAppleReminders,
  });
  const obsidian = useWelcomeObsidian({
    ...skillCommon,
    run: skillState.runObsidian,
    goObsidianPage: nav.goObsidianPage,
  });
  const { onGitHubConnect } = useWelcomeGitHub({
    ...skillCommon,
    run: skillState.runGitHub,
  });
  const { onNotionApiKeySubmit } = useWelcomeNotion({
    ...skillCommon,
    run: skillState.runNotion,
  });
  const { onTrelloSubmit } = useWelcomeTrello({
    ...skillCommon,
    run: skillState.runTrello,
  });
  const { onSlackConnect } = useWelcomeSlack({
    ...commonDeps,
    run: skillState.runSlack,
    markSkillConnected,
    goSlackReturn: nav.goSlackBack,
  });
  const { onWebSearchSubmit } = useWelcomeWebSearch({
    ...skillCommon,
    run: skillState.runWebSearch,
  });
  const { onMediaUnderstandingSubmit } = useWelcomeMediaUnderstanding({
    gw,
    loadConfig,
    setStatus,
    run: skillState.runMediaUnderstanding,
    markSkillConnected,
    goSkills: nav.goSkills,
  });

  const telegram = useWelcomeTelegram({
    ...commonDeps,
    goTelegramUser: nav.goTelegramUser,
    goConnections: nav.goConnections,
  });

  const gog = useWelcomeGog({ gw });

  // --- Orchestrator-level handlers ---

  const finish = React.useCallback(() => {
    captureRenderer(ANALYTICS_EVENTS.onboardingStep, { step: "finished", flow: "self-managed" });
    dispatch(authActions.setMode("self-managed"));
    persistDesktopMode("self-managed");
    void dispatch(setOnboarded(true));
    void navigate(routes.chat, { replace: true });
  }, [dispatch, navigate]);

  const goMediaUnderstanding = React.useCallback(() => {
    void refreshProviderFlags();
    void navigate(`${routes.welcome}/media-understanding`);
  }, [navigate, refreshProviderFlags]);

  const onProviderSelect = React.useCallback(
    (provider: Provider) => {
      setSelectedProvider(provider);
      setError(null);
      setStatus(null);
      const info = MODEL_PROVIDER_BY_ID[provider];
      if (info?.authType === "oauth") {
        goOAuthProvider();
      } else if (info?.authType === "ollama") {
        goOllamaSetup();
      } else {
        goApiKey();
      }
    },
    [goApiKey, goOAuthProvider, goOllamaSetup, setError]
  );

  const onOAuthSuccess = React.useCallback(
    async (profileId: string) => {
      try {
        // Update config with auth profile entry (same pattern as saveApiKey).
        const provider = profileId.split(":")[0] ?? "";
        const snap = await loadConfig();
        const baseHash =
          typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
        if (baseHash && provider) {
          await patchAuthProfile({
            gw,
            baseHash,
            provider,
            mode: "oauth",
            profileId,
            notePrefix: "Welcome",
          });
          await gw.request("secrets.reload", {});
        }
        await loadModels();
        goModelSelect();
      } catch (err) {
        setError(errorToMessage(err));
      }
    },
    [goModelSelect, gw, loadConfig, loadModels, setError]
  );

  const onApiKeySubmit = React.useCallback(
    async (apiKey: string) => {
      if (!selectedProvider) {
        return;
      }
      setApiKeyBusy(true);
      setError(null);
      try {
        const ok = await saveApiKey(selectedProvider, apiKey);
        if (ok) {
          if (selectedProvider === "openai") {
            setVoiceProvider("openai");
          }
          await loadModels();
          goModelSelect();
        }
      } catch (err) {
        setError(errorToMessage(err));
      } finally {
        setApiKeyBusy(false);
      }
    },
    [goModelSelect, loadModels, saveApiKey, selectedProvider, setError]
  );

  const onOllamaSubmit = React.useCallback(
    async (params: OllamaSetupParams) => {
      setApiKeyBusy(true);
      setError(null);
      try {
        setSavedOllamaParams(params);
        const snap = await loadConfig();
        const baseHash =
          typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
        if (!baseHash) {
          throw new Error("Missing config base hash");
        }
        await getDesktopApiOrNull()?.setApiKey("ollama", params.apiKey);
        await gw.request("config.patch", {
          baseHash,
          raw: JSON.stringify(
            {
              models: {
                providers: {
                  ollama: {
                    baseUrl: params.baseUrl,
                    api: "ollama",
                    apiKey: "OLLAMA_API_KEY", // pragma: allowlist secret
                    models: [],
                  },
                },
              },
              auth: {
                profiles: {
                  "ollama:default": { provider: "ollama", mode: "api_key" },
                },
                order: {
                  ollama: ["ollama:default"],
                },
              },
            },
            null,
            2
          ),
          note: "Welcome: configure Ollama provider",
        });
        await gw.request("secrets.reload", {});
        await loadModels();
        goModelSelect();
      } catch (err) {
        setError(errorToMessage(err));
      } finally {
        setApiKeyBusy(false);
      }
    },
    [goModelSelect, gw, loadConfig, loadModels, setError]
  );

  const retryOllamaSubmit = React.useCallback(async () => {
    if (!savedOllamaParams) {
      await loadModels();
      return;
    }
    await onOllamaSubmit(savedOllamaParams);
  }, [loadModels, onOllamaSubmit, savedOllamaParams]);

  const onSetupTokenSubmit = React.useCallback(
    async (token: string) => {
      if (!selectedProvider) {
        return;
      }
      setApiKeyBusy(true);
      setError(null);
      try {
        const ok = await saveSetupToken(selectedProvider, token);
        if (ok) {
          await loadModels();
          goModelSelect();
        }
      } catch (err) {
        setError(errorToMessage(err));
      } finally {
        setApiKeyBusy(false);
      }
    },
    [goModelSelect, loadModels, saveSetupToken, selectedProvider, setError]
  );

  return {
    // Skill busy flags
    appleNotesBusy: skillState.appleNotesBusy,
    appleRemindersBusy: skillState.appleRemindersBusy,
    githubBusy: skillState.githubBusy,
    mediaUnderstandingBusy: skillState.mediaUnderstandingBusy,
    notionBusy: skillState.notionBusy,
    obsidianBusy: skillState.obsidianBusy,
    slackBusy: skillState.slackBusy,
    trelloBusy: skillState.trelloBusy,
    webSearchBusy: skillState.webSearchBusy,
    skills,
    markSkillConnected,

    // Navigation (spread)
    ...nav,

    // Config
    configPath: config.configPath,
    hasOpenAiProvider: config.hasOpenAiProvider,
    start: config.start,
    startBusy: config.startBusy,

    // Models
    loadModels,
    models,
    modelsError,
    modelsLoading,

    // Obsidian (spread domain state)
    goObsidian: obsidian.goObsidian,
    obsidianVaults: obsidian.obsidianVaults,
    obsidianVaultsLoading: obsidian.obsidianVaultsLoading,
    onObsidianRecheck: obsidian.onObsidianRecheck,
    onObsidianSetDefaultAndEnable: obsidian.onObsidianSetDefaultAndEnable,
    selectedObsidianVaultName: obsidian.selectedObsidianVaultName,
    setSelectedObsidianVaultName: obsidian.setSelectedObsidianVaultName,

    // Telegram
    channelsProbe: telegram.channelsProbe,
    onTelegramTokenNext: telegram.onTelegramTokenNext,
    onTelegramUserNext: telegram.onTelegramUserNext,
    setTelegramToken: telegram.setTelegramToken,
    setTelegramUserId: telegram.setTelegramUserId,
    telegramStatus: telegram.telegramStatus,
    telegramToken: telegram.telegramToken,
    telegramUserId: telegram.telegramUserId,

    // Gog
    gogAccount: gog.gogAccount,
    gogBusy: gog.gogBusy,
    gogError: gog.gogError,
    gogOutput: gog.gogOutput,
    onGogAuthAdd: gog.onGogAuthAdd,
    onGogAuthList: gog.onGogAuthList,
    setGogAccount: gog.setGogAccount,

    // Handlers from domain hooks
    onAppleNotesCheckAndEnable,
    onAppleRemindersAuthorizeAndEnable,
    onGitHubConnect,
    onMediaProviderKeySubmit,
    onMediaUnderstandingSubmit,
    onNotionApiKeySubmit,
    onSlackConnect,
    onTrelloSubmit,
    onWebSearchSubmit,

    // Orchestrator handlers
    apiKeyBusy,
    error,
    finish,
    goMediaUnderstanding,
    onApiKeySubmit,
    onOllamaSubmit,
    onSetupTokenSubmit,
    onModelSelect,
    onOAuthSuccess,
    onProviderSelect,
    retryOllamaSubmit,
    selectedProvider,
    status,
  };
}
