import React from "react";
import type { NavigateFunction } from "react-router-dom";
import { routes } from "../../app/routes";

type PaidNavigationInput = {
  navigate: NavigateFunction;
};

/**
 * Pure navigation callbacks for the paid onboarding flow.
 * Each callback navigates to a unified route path.
 */
export function usePaidNavigation({ navigate }: PaidNavigationInput) {
  const goSetupMode = React.useCallback(() => {
    void navigate(`${routes.welcome}/setup-mode`);
  }, [navigate]);

  const goPaidModelSelect = React.useCallback(() => {
    void navigate(`${routes.welcome}/paid-model-select`);
  }, [navigate]);

  const goSetupReview = React.useCallback(() => {
    void navigate(`${routes.welcome}/setup-review`);
  }, [navigate]);

  const goSuccess = React.useCallback(() => {
    void navigate(`${routes.welcome}/success`);
  }, [navigate]);

  const goPaidSkills = React.useCallback(() => {
    void navigate(`${routes.welcome}/skills`);
  }, [navigate]);

  const goPaidConnections = React.useCallback(() => {
    void navigate(`${routes.welcome}/connections`);
  }, [navigate]);

  const goPaidObsidianPage = React.useCallback(() => {
    void navigate(`${routes.welcome}/obsidian`);
  }, [navigate]);

  const goPaidTelegramUser = React.useCallback(() => {
    void navigate(`${routes.welcome}/telegram-user`);
  }, [navigate]);

  const paidSlackReturnToRef = React.useRef<"skills" | "connections">("skills");

  const goPaidSlackFromSkills = React.useCallback(() => {
    paidSlackReturnToRef.current = "skills";
    void navigate(`${routes.welcome}/slack`);
  }, [navigate]);

  const goPaidSlackFromConnections = React.useCallback(() => {
    paidSlackReturnToRef.current = "connections";
    void navigate(`${routes.welcome}/slack`);
  }, [navigate]);

  const goPaidSlackBack = React.useCallback(() => {
    if (paidSlackReturnToRef.current === "connections") {
      goPaidConnections();
      return;
    }
    goPaidSkills();
  }, [goPaidConnections, goPaidSkills]);

  return {
    goSetupMode,
    goPaidModelSelect,
    goSetupReview,
    goSuccess,
    goPaidSkills,
    goPaidConnections,
    goPaidObsidianPage,
    goPaidTelegramUser,
    goPaidSlackFromSkills,
    goPaidSlackFromConnections,
    goPaidSlackBack,
  } as const;
}
