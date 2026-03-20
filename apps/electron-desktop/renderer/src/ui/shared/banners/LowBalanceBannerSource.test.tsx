// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { LowBalanceBannerSource } from "./LowBalanceBannerSource";
import { BannerProvider, useBanners } from "./BannerContext";
import { BannerCarousel } from "./BannerCarousel";

const mockAuthState = {
  subscription: null as {
    status: string;
    currentPeriodEnd: string;
    stripeSubscriptionId: string;
  } | null,
  balance: null as { remaining: number; limit: number; usage: number } | null,
  jwt: "test-jwt",
};

const mockDispatch = vi.fn();
const mockOpenExternal = vi.fn();
const mockCreateAddonCheckout = vi.fn();

vi.mock("@store/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (st: unknown) => unknown) => selector({ auth: mockAuthState }),
}));

vi.mock("@store/slices/auth/authSlice", () => ({
  createAddonCheckout: (payload: unknown) => mockCreateAddonCheckout(payload),
}));

vi.mock("@ipc/desktopApi", () => ({
  getDesktopApiOrNull: () => ({ openExternal: mockOpenExternal }),
}));

function TestHarness() {
  return (
    <BannerProvider>
      <LowBalanceBannerSource />
      <BannerDisplay />
    </BannerProvider>
  );
}

function BannerDisplay() {
  const banners = useBanners();
  return <BannerCarousel items={banners} />;
}

describe("LowBalanceBannerSource", () => {
  afterEach(cleanup);

  beforeEach(() => {
    mockAuthState.subscription = null;
    mockAuthState.balance = null;
    mockAuthState.jwt = "test-jwt";
    mockDispatch.mockReset();
    mockCreateAddonCheckout.mockReset();
    mockOpenExternal.mockReset();
  });

  it("does not show banner when subscription is null", () => {
    mockAuthState.subscription = null;
    mockAuthState.balance = { remaining: 0, limit: 10, usage: 10 };
    const { container } = render(<TestHarness />);
    expect(container.querySelector("[role='status']")).toBeNull();
  });

  it("does not show banner when subscription is canceled", () => {
    mockAuthState.subscription = {
      status: "canceled",
      currentPeriodEnd: "2026-03-01",
      stripeSubscriptionId: "sub_1",
    };
    mockAuthState.balance = { remaining: 0, limit: 10, usage: 10 };
    const { container } = render(<TestHarness />);
    expect(container.querySelector("[role='status']")).toBeNull();
  });

  it("does not show banner when balance is above threshold", () => {
    mockAuthState.subscription = {
      status: "active",
      currentPeriodEnd: "2026-03-01",
      stripeSubscriptionId: "sub_1",
    };
    mockAuthState.balance = { remaining: 5, limit: 10, usage: 5 };
    const { container } = render(<TestHarness />);
    expect(container.querySelector("[role='status']")).toBeNull();
  });

  it("shows banner when subscription is active and balance <= 0.05", () => {
    mockAuthState.subscription = {
      status: "active",
      currentPeriodEnd: "2026-03-01",
      stripeSubscriptionId: "sub_1",
    };
    mockAuthState.balance = { remaining: 0.02, limit: 10, usage: 9.98 };
    render(<TestHarness />);
    expect(screen.getByText("No credits left")).toBeTruthy();
    expect(screen.getByText("Top up")).toBeTruthy();
  });

  it("dispatches top-up checkout when Top up is clicked", async () => {
    mockAuthState.subscription = {
      status: "active",
      currentPeriodEnd: "2026-03-01",
      stripeSubscriptionId: "sub_1",
    };
    mockAuthState.balance = { remaining: 0, limit: 10, usage: 10 };
    mockDispatch.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ checkoutUrl: "https://checkout.stripe.com/c/pay_123" }),
    });

    render(<TestHarness />);
    fireEvent.click(screen.getByText("Top up"));

    await waitFor(() => {
      expect(mockCreateAddonCheckout).toHaveBeenCalledWith({ amountUsd: 10 });
    });
    await waitFor(() => {
      expect(mockOpenExternal).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay_123");
    });
  });

  it("hides banner when dismiss button is clicked", () => {
    mockAuthState.subscription = {
      status: "active",
      currentPeriodEnd: "2026-03-01",
      stripeSubscriptionId: "sub_1",
    };
    mockAuthState.balance = { remaining: 0, limit: 10, usage: 10 };
    render(<TestHarness />);
    expect(screen.getByText("No credits left")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Dismiss banner/i }));
    expect(screen.queryByText("No credits left")).toBeNull();
  });
});
