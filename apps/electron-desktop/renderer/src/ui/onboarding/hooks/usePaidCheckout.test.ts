// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePaidCheckout } from "./usePaidCheckout";

vi.mock("@ipc/backendApi", () => ({
  backendApi: {
    getSubscriptionInfo: vi.fn(),
    createSetupCheckout: vi.fn(),
  },
}));

vi.mock("@shared/utils/openExternal", () => ({
  openExternal: vi.fn(),
}));

import { backendApi } from "@ipc/backendApi";
import { openExternal } from "@shared/utils/openExternal";

const mockedGetSubscriptionInfo = vi.mocked(backendApi.getSubscriptionInfo);
const mockedCreateSetupCheckout = vi.mocked(backendApi.createSetupCheckout);
const mockedOpenExternal = vi.mocked(openExternal);

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  mockedGetSubscriptionInfo.mockReset();
  mockedCreateSetupCheckout.mockReset();
  mockedOpenExternal.mockReset();
});

describe("usePaidCheckout", () => {
  it("initializes with idle state", () => {
    const { result } = renderHook(() => usePaidCheckout("jwt-token"));
    expect(result.current.payBusy).toBe(false);
    expect(result.current.payError).toBeNull();
    expect(result.current.paymentPending).toBe(false);
    expect(result.current.subscriptionPrice).toBeNull();
  });

  it("loadSubscriptionPrice fetches and stores price", async () => {
    const price = { amount: 2000, currency: "usd" };
    mockedGetSubscriptionInfo.mockResolvedValue(price as Awaited<
      ReturnType<typeof backendApi.getSubscriptionInfo>
    >);

    const { result } = renderHook(() => usePaidCheckout("jwt-token"));

    await act(async () => {
      await result.current.loadSubscriptionPrice();
    });

    expect(result.current.subscriptionPrice).toEqual(price);
  });

  it("loadSubscriptionPrice silently handles errors", async () => {
    mockedGetSubscriptionInfo.mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => usePaidCheckout("jwt-token"));

    await act(async () => {
      await result.current.loadSubscriptionPrice();
    });

    expect(result.current.subscriptionPrice).toBeNull();
  });

  it("onPay creates checkout and opens external URL", async () => {
    mockedCreateSetupCheckout.mockResolvedValue({ checkoutUrl: "https://pay.example.com/session" });

    const { result } = renderHook(() => usePaidCheckout("jwt-token"));

    await act(async () => {
      await result.current.onPay();
    });

    expect(mockedCreateSetupCheckout).toHaveBeenCalledWith("jwt-token", {});
    expect(mockedOpenExternal).toHaveBeenCalledWith("https://pay.example.com/session");
    expect(result.current.paymentPending).toBe(true);
    expect(result.current.payBusy).toBe(false);
  });

  it("onPay sets error when jwt is null", async () => {
    const { result } = renderHook(() => usePaidCheckout(null));

    await act(async () => {
      await result.current.onPay();
    });

    expect(result.current.payError).toBe("Not authenticated");
    expect(mockedCreateSetupCheckout).not.toHaveBeenCalled();
  });

  it("onPay sets error on API failure", async () => {
    mockedCreateSetupCheckout.mockRejectedValue(new Error("Payment service down"));

    const { result } = renderHook(() => usePaidCheckout("jwt-token"));

    await act(async () => {
      await result.current.onPay();
    });

    expect(result.current.payError).toContain("Payment service down");
    expect(result.current.payBusy).toBe(false);
  });

  it("cancelPending resets paymentPending", async () => {
    mockedCreateSetupCheckout.mockResolvedValue({ checkoutUrl: "https://pay.example.com/session" });

    const { result } = renderHook(() => usePaidCheckout("jwt-token"));

    await act(async () => {
      await result.current.onPay();
    });
    expect(result.current.paymentPending).toBe(true);

    act(() => {
      result.current.cancelPending();
    });
    expect(result.current.paymentPending).toBe(false);
  });
});
