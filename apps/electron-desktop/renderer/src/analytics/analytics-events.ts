/** Typed catalog of all analytics event names. */
export const ANALYTICS_EVENTS = {
  appLaunched: "app_launched",
  onboardingCompleted: "onboarding_completed",
  pageView: "page_view",
  chatStarted: "chat_started",
  updateInstalled: "update_installed",
  gatewayStarted: "gateway_started",
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
