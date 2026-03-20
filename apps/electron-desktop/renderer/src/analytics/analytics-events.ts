/** Typed catalog of all analytics event names. */
export const ANALYTICS_EVENTS = {
  appLaunched: "app_launched",
  appOpened: "app_opened",
  messageSent: "message_sent",
  updateInstalled: "update_installed",
  onboardingStep: "onboarding_step",
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
