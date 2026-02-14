import { useCallback, useRef } from "react";
import type { NavigateFunction } from "react-router-dom";
import { routes } from "../../routes";

/**
 * All navigation callbacks for the welcome/onboarding flow.
 *
 * Extracts the 16+ `goXxx` helpers that were previously inlined in
 * `useWelcomeState`, keeping the orchestrator slim.
 */
export function useWelcomeNavigation(navigate: NavigateFunction) {
  const goApiKey = useCallback(() => {
    void navigate(`${routes.welcome}/api-key`);
  }, [navigate]);

  const goModelSelect = useCallback(() => {
    void navigate(`${routes.welcome}/model-select`);
  }, [navigate]);

  const goWebSearch = useCallback(() => {
    void navigate(`${routes.welcome}/web-search`);
  }, [navigate]);

  const goSkills = useCallback(() => {
    void navigate(`${routes.welcome}/skills`);
  }, [navigate]);

  const goNotion = useCallback(() => {
    void navigate(`${routes.welcome}/notion`);
  }, [navigate]);

  const goTrello = useCallback(() => {
    void navigate(`${routes.welcome}/trello`);
  }, [navigate]);

  const goTelegramToken = useCallback(() => {
    void navigate(`${routes.welcome}/telegram-token`);
  }, [navigate]);

  const goTelegramUser = useCallback(() => {
    void navigate(`${routes.welcome}/telegram-user`);
  }, [navigate]);

  const goGog = useCallback(() => {
    void navigate(`${routes.welcome}/gog`);
  }, [navigate]);

  const goGogGoogleWorkspace = useCallback(() => {
    void navigate(`${routes.welcome}/gog-google-workspace`);
  }, [navigate]);

  const goProviderSelect = useCallback(() => {
    void navigate(`${routes.welcome}/provider-select`);
  }, [navigate]);

  const goAppleNotes = useCallback(() => {
    void navigate(`${routes.welcome}/apple-notes`);
  }, [navigate]);

  const goAppleReminders = useCallback(() => {
    void navigate(`${routes.welcome}/apple-reminders`);
  }, [navigate]);

  const goGitHub = useCallback(() => {
    void navigate(`${routes.welcome}/github`);
  }, [navigate]);

  const goConnections = useCallback(() => {
    void navigate(`${routes.welcome}/connections`);
  }, [navigate]);

  // Slack has a return-to context: either "skills" or "connections"
  const slackReturnToRef = useRef<"skills" | "connections">("skills");

  const goSlackFromSkills = useCallback(() => {
    slackReturnToRef.current = "skills";
    void navigate(`${routes.welcome}/slack`);
  }, [navigate]);

  const goSlackFromConnections = useCallback(() => {
    slackReturnToRef.current = "connections";
    void navigate(`${routes.welcome}/slack`);
  }, [navigate]);

  const goSlackBack = useCallback(() => {
    if (slackReturnToRef.current === "connections") {
      goConnections();
      return;
    }
    goSkills();
  }, [goConnections, goSkills]);

  return {
    goApiKey,
    goAppleNotes,
    goAppleReminders,
    goConnections,
    goGitHub,
    goGog,
    goGogGoogleWorkspace,
    goModelSelect,
    goNotion,
    goProviderSelect,
    goSkills,
    goSlackBack,
    goSlackFromConnections,
    goSlackFromSkills,
    goTelegramToken,
    goTelegramUser,
    goTrello,
    goWebSearch,
    /** Ref tracking which page Slack should return to. */
    slackReturnToRef,
  } as const;
}
