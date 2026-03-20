import { PostHog } from "posthog-node";

// Inlined at build time by scripts/define-main-env.mjs via esbuild --define.
// In dev, loaded from .env by that same script (or from the shell environment).
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY ?? "";
const POSTHOG_HOST = "https://us.i.posthog.com";

let client: PostHog | null = null;
let currentUserId: string | null = null;

export function initPosthogMain(userId: string, enabled: boolean): void {
  currentUserId = userId;
  if (!enabled) {
    return;
  }
  client = new PostHog(POSTHOG_API_KEY, {
    host: POSTHOG_HOST,
    flushAt: 20,
    flushInterval: 10_000,
    disableGeoip: true,
  });
  client.identify({ distinctId: userId });
}

/** Capture an event from the main process. Safe to call even if analytics is disabled. */
export function captureMain(event: string, properties?: Record<string, unknown>): void {
  if (!client || !currentUserId) {
    return;
  }
  try {
    client.capture({ distinctId: currentUserId, event, properties });
  } catch {
    // Never let analytics errors surface to the user.
  }
}

/** Enable analytics and (re-)initialize the PostHog client. */
export function optInMain(userId: string): void {
  currentUserId = userId;
  if (client) {
    return;
  }
  client = new PostHog(POSTHOG_API_KEY, {
    host: POSTHOG_HOST,
    flushAt: 20,
    flushInterval: 10_000,
    disableGeoip: true,
  });
  client.identify({ distinctId: userId });
}

/** Disable analytics and shut down the PostHog client. */
export function optOutMain(): void {
  if (!client) {
    return;
  }
  void client.shutdown();
  client = null;
}

/** Flush remaining events and shut down. Call on app quit. */
export async function shutdownPosthogMain(): Promise<void> {
  if (!client) {
    return;
  }
  try {
    await client.shutdown();
  } catch {
    // Best-effort flush.
  }
  client = null;
}
