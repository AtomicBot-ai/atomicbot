// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { SubscriptionBannerSource } from "./SubscriptionBannerSource";
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

vi.mock("@store/hooks", () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (selector: (st: unknown) => unknown) => selector({ auth: mockAuthState }),
}));

const mockGetPortalUrl = vi.fn();
const mockCreateSetupCheckout = vi.fn();
const mockOpenExternal = vi.fn();

vi.mock("@ipc/backendApi", () => ({
  backendApi: {
    getPortalUrl: (...args: unknown[]) => mockGetPortalUrl(...args),
    createSetupCheckout: (...args: unknown[]) => mockCreateSetupCheckout(...args),
  },
}));

vi.mock("@ipc/desktopApi", () => ({
  getDesktopApiOrNull: () => ({ openExternal: mockOpenExternal }),
}));

function TestHarness() {
  return (
    <BannerProvider>
      <SubscriptionBannerSource />
      <BannerDisplay />
    </BannerProvider>
  );
}

function BannerDisplay() {
  const banners = useBanners();
  return <BannerCarousel items={banners} />;
}

describe("SubscriptionBannerSource", () => {
  afterEach(cleanup);

  beforeEach(() => {
    mockAuthState.subscription = null;
    mockAuthState.balance = null;
    mockAuthState.jwt = "test-jwt";
    mockGetPortalUrl.mockReset();
    mockCreateSetupCheckout.mockReset();
    mockOpenExternal.mockReset();
  });

  it("does not show banner when subscription is null and no balance", () => {
    mockAuthState.subscription = null;
    mockAuthState.balance = null;
    const { container } = render(<TestHarness />);
    expect(container.querySelector("[role='status']")).toBeNull();
  });

  it("shows banner when subscription is null but balance exists", () => {
    mockAuthState.subscription = null;
    mockAuthState.balance = { remaining: 5, limit: 10, usage: 5 };
    render(<TestHarness />);
    expect(screen.getByText("Subscription expired")).toBeTruthy();
    expect(screen.getByText("Renew now")).toBeTruthy();
  });

  it("does not show banner when subscription is active", () => {
    mockAuthState.subscription = {
      status: "active",
      currentPeriodEnd: "2026-03-01",
      stripeSubscriptionId: "sub_1",
    };
    const { container } = render(<TestHarness />);
    expect(container.querySelector("[role='status']")).toBeNull();
  });

  it("shows banner when subscription is canceled", () => {
    mockAuthState.subscription = {
      status: "canceled",
      currentPeriodEnd: "2026-03-01",
      stripeSubscriptionId: "sub_1",
    };
    render(<TestHarness />);
    expect(screen.getByText("Subscription expired")).toBeTruthy();
    expect(screen.getByText("Subscription paused. Renew to restore access.")).toBeTruthy();
    expect(screen.getByText("Renew now")).toBeTruthy();
  });

  it("opens stripe portal when canceled and Renew now is clicked", async () => {
    mockAuthState.subscription = {
      status: "canceled",
      currentPeriodEnd: "2026-03-01",
      stripeSubscriptionId: "sub_1",
    };
    mockGetPortalUrl.mockResolvedValue({ portalUrl: "https://billing.stripe.com/portal" });

    render(<TestHarness />);
    fireEvent.click(screen.getByText("Renew now"));

    await waitFor(() => {
      expect(mockGetPortalUrl).toHaveBeenCalledWith("test-jwt");
    });
    await waitFor(() => {
      expect(mockOpenExternal).toHaveBeenCalledWith("https://billing.stripe.com/portal");
    });
  });

  it("opens stripe checkout when subscription is null and Renew now is clicked", async () => {
    mockAuthState.subscription = null;
    mockAuthState.balance = { remaining: 5, limit: 10, usage: 5 };
    mockCreateSetupCheckout.mockResolvedValue({
      checkoutUrl: "https://checkout.stripe.com/c/pay_123",
      sessionId: "sess_1",
      deploymentId: "dep_1",
    });

    render(<TestHarness />);
    fireEvent.click(screen.getByText("Renew now"));

    await waitFor(() => {
      expect(mockCreateSetupCheckout).toHaveBeenCalledWith("test-jwt", {});
    });
    await waitFor(() => {
      expect(mockOpenExternal).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay_123");
    });
  });

  it("hides banner when dismiss button is clicked", () => {
    mockAuthState.subscription = null;
    mockAuthState.balance = { remaining: 5, limit: 10, usage: 5 };
    render(<TestHarness />);
    expect(screen.getByText("Subscription expired")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Dismiss banner/i }));
    expect(screen.queryByText("Subscription expired")).toBeNull();
  });
});
