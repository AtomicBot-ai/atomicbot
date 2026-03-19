import posthog from "posthog-js";

// Injected by Vite at build time from VITE_POSTHOG_API_KEY in .env.
const POSTHOG_API_KEY = import.meta.env.VITE_POSTHOG_API_KEY ?? "";
const POSTHOG_HOST = "https://eu.i.posthog.com";

let initialized = false;
let currentUserId: string | null = null;

export function initPosthogRenderer(userId: string, enabled: boolean): void {
  if (initialized) {
    return;
  }
  initialized = true;
  currentUserId = userId;

  posthog.init(POSTHOG_API_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: "identified_only",
    // Disable automatic captures — only manual events.
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    loaded: (ph) => {
      if (enabled) {
        ph.identify(userId);
      } else {
        ph.opt_out_capturing();
      }
    },
  });
}

/** Capture an event from the renderer. Safe to call before init or when opted out. */
export function captureRenderer(event: string, properties?: Record<string, unknown>): void {
  try {
    if (!posthog.__loaded || posthog.has_opted_out_capturing()) {
      return;
    }
    posthog.capture(event, properties);
  } catch {
    // Never let analytics errors surface to the user.
  }
}

/** Enable analytics for the renderer and identify the user. */
export function optInRenderer(userId: string): void {
  try {
    if (!posthog.__loaded) {
      return;
    }
    currentUserId = userId;
    posthog.opt_in_capturing();
    posthog.identify(userId);
  } catch {
    // Best-effort.
  }
}

/** Disable analytics for the renderer. */
export function optOutRenderer(): void {
  try {
    if (!posthog.__loaded) {
      return;
    }
    posthog.opt_out_capturing();
    posthog.reset();
    currentUserId = null;
  } catch {
    // Best-effort.
  }
}

export function getCurrentUserId(): string | null {
  return currentUserId;
}
