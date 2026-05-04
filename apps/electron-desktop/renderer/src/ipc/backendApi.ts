/**
 * HTTP client for the atomic-claw-backend API.
 * Used in paid "Do everything for me" mode for auth, billing, and key management.
 */

const BACKEND_URL =
  (typeof window !== "undefined" &&
    (window as unknown as Record<string, unknown>).__BACKEND_URL__) ||
  import.meta.env.VITE_BACKEND_URL ||
  "https://api.atomicbot.ai";

export type DeploymentInfo = {
  id: string;
  status: string;
  billingStatus: string;
  dropletId: string | null;
};

export type SubscriptionInfo = {
  status: string;
  currentPeriodEnd: string;
  stripeSubscriptionId: string;
};

export type DesktopStatusResponse = {
  hasKey: boolean;
  balance: { remaining: number; limit: number; usage: number } | null;
  deployment: DeploymentInfo | null;
  subscription: SubscriptionInfo | null;
};

export type BalanceResponse = {
  remaining: number;
  limit: number;
  usage: number;
};

export type SubscriptionPriceInfo = {
  priceId: string;
  amountCents: number;
  currency: string;
  interval: string;
  credits: number | null;
};

export type AddonCheckoutResponse = {
  checkoutUrl: string;
};

export type AutoTopUpSettingsResponse = {
  enabled: boolean;
  thresholdUsd: number;
  topupAmountUsd: number;
  monthlyCapUsd: number | null;
  stripePaymentMethodId: string | null;
  lastTriggeredAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failureCount: number;
  hasPaymentMethod: boolean;
  currentMonthSpentUsd: number;
};

export type UpdateAutoTopUpPayload = {
  enabled?: boolean;
  thresholdUsd?: number;
  topupAmountUsd?: number;
  monthlyCapUsd?: number | null;
};

async function backendFetch<T>(path: string, jwt: string, opts?: RequestInit): Promise<T> {
  const url = `${BACKEND_URL}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
      ...(opts?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    let msg: string;
    try {
      msg = (JSON.parse(body) as { error?: string }).error || body;
    } catch {
      msg = body;
    }
    throw new Error(msg);
  }

  return (await res.json()) as T;
}

async function backendFetchPublic<T>(path: string): Promise<T> {
  const url = `${BACKEND_URL}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const body = await res.text();
    let msg: string;
    try {
      msg = (JSON.parse(body) as { error?: string }).error || body;
    } catch {
      msg = body;
    }
    throw new Error(msg);
  }

  return (await res.json()) as T;
}

export const backendApi = {
  getStatus(jwt: string): Promise<DesktopStatusResponse> {
    return backendFetch("/desktop/status", jwt);
  },

  async createSetupCheckout(
    jwt: string,
    params: { model?: string }
  ): Promise<{ checkoutUrl: string; sessionId: string; deploymentId: string }> {
    return backendFetch("/desktop/setup", jwt, {
      method: "POST",
      body: JSON.stringify(params),
    });
  },

  getBalance(jwt: string, sync?: boolean): Promise<BalanceResponse> {
    const qs = sync ? "?sync=true" : "";
    return backendFetch(`/billing/balance${qs}`, jwt);
  },

  getKeys(jwt: string): Promise<{ openrouterApiKey: string | null; openaiApiKey: string | null }> {
    return backendFetch("/secrets/keys", jwt);
  },

  getSubscriptionInfo(): Promise<SubscriptionPriceInfo> {
    return backendFetchPublic("/desktop/subscription-info");
  },

  getPortalUrl(jwt: string): Promise<{ portalUrl: string }> {
    return backendFetch("/billing/portal", jwt);
  },

  createAddonCheckout(
    jwt: string,
    params: { amountUsd: number; successUrl?: string; cancelUrl?: string }
  ): Promise<AddonCheckoutResponse> {
    return backendFetch("/billing/addon", jwt, {
      method: "POST",
      body: JSON.stringify(params),
    });
  },

  getAutoTopUpSettings(jwt: string): Promise<AutoTopUpSettingsResponse> {
    return backendFetch("/billing/auto-topup", jwt);
  },

  updateAutoTopUpSettings(
    jwt: string,
    payload: UpdateAutoTopUpPayload
  ): Promise<AutoTopUpSettingsResponse> {
    return backendFetch("/billing/auto-topup", jwt, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
};
