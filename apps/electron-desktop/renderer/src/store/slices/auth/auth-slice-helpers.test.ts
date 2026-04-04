/**
 * Tests for auth-utils — config extraction helpers and resetAuthFields.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_AUTO_TOP_UP_SETTINGS } from "./auth-types";
import type { AuthSliceState } from "./auth-types";
import {
  extractAuth,
  extractModel,
  getBaseHash,
  normalizeAutoTopUpSettings,
  resetAuthFields,
} from "./auth-slice-helpers";

// ── extractAuth ─────────────────────────────────────────────────────────────

describe("extractAuth", () => {
  it("extracts profiles and order from config", () => {
    const cfg = {
      auth: {
        profiles: { "anthropic:default": { provider: "anthropic" } },
        order: { anthropic: ["anthropic:default"] },
      },
    };
    const result = extractAuth(cfg);
    expect(result.profiles).toEqual({ "anthropic:default": { provider: "anthropic" } });
    expect(result.order).toEqual({ anthropic: ["anthropic:default"] });
  });

  it("returns undefined parts when auth section is missing", () => {
    const result = extractAuth({});
    expect(result.profiles).toBeUndefined();
    expect(result.order).toBeUndefined();
  });

  it("returns undefined parts when auth is not an object", () => {
    const result = extractAuth({ auth: "invalid" });
    expect(result.profiles).toBeUndefined();
    expect(result.order).toBeUndefined();
  });

  it("handles auth as array gracefully", () => {
    const result = extractAuth({ auth: [1, 2, 3] });
    expect(result.profiles).toBeUndefined();
    expect(result.order).toBeUndefined();
  });
});

// ── extractModel ────────────────────────────────────────────────────────────

describe("extractModel", () => {
  it("extracts primary and models from config", () => {
    const cfg = {
      agents: {
        defaults: {
          model: { primary: "anthropic/claude-sonnet-4.6" },
          models: { "anthropic/claude-sonnet-4.6": {} },
        },
      },
    };
    const result = extractModel(cfg);
    expect(result.primary).toBe("anthropic/claude-sonnet-4.6");
    expect(result.models).toEqual({ "anthropic/claude-sonnet-4.6": {} });
  });

  it("returns undefined parts when agents section is missing", () => {
    const result = extractModel({});
    expect(result.primary).toBeUndefined();
    expect(result.models).toBeUndefined();
  });

  it("returns undefined primary when model is not an object", () => {
    const result = extractModel({ agents: { defaults: { model: "string" } } });
    expect(result.primary).toBeUndefined();
  });

  it("returns undefined primary when primary is not a string", () => {
    const result = extractModel({ agents: { defaults: { model: { primary: 42 } } } });
    expect(result.primary).toBeUndefined();
  });
});

// ── getBaseHash ─────────────────────────────────────────────────────────────

describe("getBaseHash", () => {
  it("returns trimmed hash when present", () => {
    expect(getBaseHash({ hash: "abc123" })).toBe("abc123");
    expect(getBaseHash({ hash: "  abc123  " })).toBe("abc123");
  });

  it("returns null for empty or whitespace hash", () => {
    expect(getBaseHash({ hash: "" })).toBeNull();
    expect(getBaseHash({ hash: "   " })).toBeNull();
  });

  it("returns null when hash is missing", () => {
    expect(getBaseHash({})).toBeNull();
  });

  it("returns null when hash is not a string", () => {
    expect(getBaseHash({ hash: 42 as unknown as string })).toBeNull();
  });
});

// ── normalizeAutoTopUpSettings ──────────────────────────────────────────────

describe("normalizeAutoTopUpSettings", () => {
  it("returns defaults when raw is null", () => {
    expect(normalizeAutoTopUpSettings(null)).toEqual(DEFAULT_AUTO_TOP_UP_SETTINGS);
  });

  it("returns defaults when raw is undefined", () => {
    expect(normalizeAutoTopUpSettings(undefined)).toEqual(DEFAULT_AUTO_TOP_UP_SETTINGS);
  });

  it("uses provided values over defaults", () => {
    const result = normalizeAutoTopUpSettings({
      enabled: false,
      thresholdUsd: 5,
      topupAmountUsd: 20,
      monthlyCapUsd: 100,
      hasPaymentMethod: true,
      currentMonthSpentUsd: 50,
    });
    expect(result).toEqual({
      enabled: false,
      thresholdUsd: 5,
      topupAmountUsd: 20,
      monthlyCapUsd: 100,
      hasPaymentMethod: true,
      currentMonthSpentUsd: 50,
    });
  });

  it("allows null monthlyCapUsd (no cap)", () => {
    const result = normalizeAutoTopUpSettings({ monthlyCapUsd: null });
    expect(result.monthlyCapUsd).toBeNull();
  });

  it("uses default monthlyCapUsd when not provided", () => {
    const result = normalizeAutoTopUpSettings({});
    expect(result.monthlyCapUsd).toBe(DEFAULT_AUTO_TOP_UP_SETTINGS.monthlyCapUsd);
  });
});

// ── resetAuthFields ─────────────────────────────────────────────────────────

describe("resetAuthFields", () => {
  it("resets all auth-related fields to initial values", () => {
    const state: AuthSliceState = {
      mode: "paid",
      jwt: "tok",
      email: "a@b.com",
      userId: "u1",
      balance: { remaining: 1, limit: 2, usage: 1 },
      deployment: { id: "d1", status: "running", billingStatus: "active", dropletId: null },
      subscription: {
        status: "active",
        currentPeriodEnd: "2026-03-01",
        stripeSubscriptionId: "sub_1",
      },
      loading: true,
      error: "err",
      lastRefreshAt: 12345,
      refreshInFlight: true,
      refreshError: "refresh-err",
      nextAllowedAt: 99999,
      refreshFailureCount: 3,
      topUpPending: true,
      topUpError: "top-up-err",
      balancePolling: true,
      autoTopUp: {
        enabled: false,
        thresholdUsd: 8,
        topupAmountUsd: 25,
        monthlyCapUsd: 90,
        hasPaymentMethod: true,
        currentMonthSpentUsd: 14,
      },
      autoTopUpLoading: true,
      autoTopUpSaving: true,
      autoTopUpError: "atop-err",
      autoTopUpLoaded: true,
    };

    resetAuthFields(state);

    // mode and loading are NOT reset — they're set separately by other reducers
    expect(state.mode).toBe("paid");
    expect(state.loading).toBe(true);

    // all auth fields are reset
    expect(state.jwt).toBeNull();
    expect(state.email).toBeNull();
    expect(state.userId).toBeNull();
    expect(state.balance).toBeNull();
    expect(state.deployment).toBeNull();
    expect(state.subscription).toBeNull();
    expect(state.error).toBeNull();
    expect(state.lastRefreshAt).toBeNull();
    expect(state.refreshInFlight).toBe(false);
    expect(state.refreshError).toBeNull();
    expect(state.nextAllowedAt).toBeNull();
    expect(state.refreshFailureCount).toBe(0);
    expect(state.topUpPending).toBe(false);
    expect(state.topUpError).toBeNull();
    expect(state.balancePolling).toBe(false);
    expect(state.autoTopUp).toEqual(DEFAULT_AUTO_TOP_UP_SETTINGS);
    expect(state.autoTopUpLoading).toBe(false);
    expect(state.autoTopUpSaving).toBe(false);
    expect(state.autoTopUpError).toBeNull();
    expect(state.autoTopUpLoaded).toBe(false);
  });
});
