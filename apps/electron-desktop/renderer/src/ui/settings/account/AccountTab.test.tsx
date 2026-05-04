// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

import { AccountTab } from "./AccountTab";

const mockRequest = vi.fn();
const mockDispatch = vi.fn();
const mockAddToast = vi.fn();
const mockAddToastError = vi.fn();
const mockCreateAddonCheckout = vi.fn();
const mockPatchAutoTopUpSettings = vi.fn();
const mockFetchAutoTopUpSettings = vi.fn();
const mockGetDesktopApiOrNull = vi.fn();
const mockOpenExternal = vi.fn();

const mockAuthState = {
  mode: "paid",
  jwt: "jwt-token",
  email: "user@test.com",
  balance: null,
  subscription: { status: "active", currentPeriodEnd: "2026-03-01", stripeSubscriptionId: "sub_1" },
  lastRefreshAt: Date.now(),
  loading: false,
  topUpPending: false,
  balancePolling: false,
  autoTopUp: {
    enabled: true,
    thresholdUsd: 2,
    topupAmountUsd: 10,
    monthlyCapUsd: 300,
    hasPaymentMethod: true,
    currentMonthSpentUsd: 0,
  },
  autoTopUpLoading: false,
  autoTopUpSaving: false,
  autoTopUpError: null,
  autoTopUpLoaded: true,
};

const mockHandleLogout = vi.fn((payload: unknown) => ({ type: "auth/handleLogout", payload }));

vi.mock("@store/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (st: unknown) => unknown) =>
    selector({
      auth: mockAuthState,
    }),
}));

vi.mock("@gateway/context", () => ({
  useGatewayRpc: () => ({ request: mockRequest }),
}));

const mockFetchBalance = vi.fn(() => ({ type: "auth/fetchBalance" }));

vi.mock("@store/slices/auth/authSlice", () => ({
  storeAuthToken: vi.fn((payload: unknown) => ({ type: "auth/storeToken", payload })),
  applySubscriptionKeys: vi.fn((payload: unknown) => ({
    type: "auth/applySubscriptionKeys",
    payload,
  })),
  handleLogout: (payload: unknown) => mockHandleLogout(payload),
  createAddonCheckout: (payload: unknown) => mockCreateAddonCheckout(payload),
  fetchBalance: () => mockFetchBalance(),
  fetchDesktopStatus: vi.fn(() => ({ type: "auth/fetchStatus" })),
  fetchAutoTopUpSettings: () => mockFetchAutoTopUpSettings(),
  patchAutoTopUpSettings: (payload: unknown) => mockPatchAutoTopUpSettings(payload),
}));

vi.mock("@store/slices/auth/mode-switch", () => ({
  switchMode: vi.fn((payload: unknown) => ({
    type: "auth/switchMode",
    payload,
  })),
}));

vi.mock("@ipc/desktopApi", () => ({
  getDesktopApiOrNull: () => mockGetDesktopApiOrNull(),
}));

vi.mock("@ipc/backendApi", () => ({
  backendApi: {
    getPortalUrl: vi.fn(),
    getSubscriptionInfo: vi.fn().mockResolvedValue({
      priceId: "price_1",
      amountCents: 2500,
      currency: "usd",
      interval: "month",
      credits: null,
    }),
    createSetupCheckout: vi.fn().mockResolvedValue({
      checkoutUrl: "https://stripe.test/subscribe",
      sessionId: "sess_1",
      deploymentId: "dep_1",
    }),
    getStatus: vi.fn().mockResolvedValue({ hasKey: true, balance: null, subscription: null }),
    getKeys: vi.fn().mockResolvedValue({ openrouterApiKey: "key_1", openaiApiKey: null }),
  },
}));

vi.mock("@shared/toast", () => ({
  addToast: (message: string) => mockAddToast(message),
  addToastError: (error: unknown) => mockAddToastError(error),
}));

vi.mock("@shared/kit", () => ({
  SecondaryButton: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  PrimaryButton: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Modal: ({
    open,
    header,
    children,
  }: {
    open: boolean;
    header: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div>
        <h2>{header}</h2>
        {children}
      </div>
    ) : null,
  InfoTooltip: ({ text }: { text: string }) => <span title={text} />,
  SplashLogo: () => <span data-testid="splash-logo" />,
}));

vi.mock("@shared/billing/AnimatedBalance", () => ({
  AnimatedBalance: ({ value, prefix = "$" }: { value: number; prefix?: string }) => (
    <span>{`${prefix}${value.toFixed(2)}`}</span>
  ),
}));

vi.mock("@ui/app/UpgradePaywallContent", () => ({
  UpgradePaywallContent: () => (
    <div>
      <span>Atomic Claw Subscription</span>
      <button type="button">Subscribe $5/mo</button>
    </div>
  ),
}));

vi.mock("@shared/billing/AutoTopUpControl", () => ({
  AutoTopUpControl: ({
    onPatch,
  }: {
    onPatch: (payload: { enabled?: boolean }) => Promise<unknown>;
  }) => (
    <button type="button" onClick={() => void onPatch({ enabled: false })}>
      Mock Auto Top-Up
    </button>
  ),
}));

describe("AccountTab logout confirmation", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDesktopApiOrNull.mockReturnValue(null);
    mockCreateAddonCheckout.mockImplementation((payload: unknown) => ({
      type: "auth/createAddonCheckout",
      payload,
    }));
    mockAuthState.topUpPending = false;
    mockDispatch.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ checkoutUrl: "https://stripe.test/checkout" }),
    });
  });

  it("opens confirmation popup and closes on cancel without logout", () => {
    render(<AccountTab />);

    fireEvent.click(screen.getByTitle("Log out"));

    expect(screen.getByText("Log out?")).not.toBeNull();
    fireEvent.click(screen.getByText("Cancel"));

    expect(screen.queryByText("Log out?")).toBeNull();
    expect(mockHandleLogout).not.toHaveBeenCalled();
  });

  it("confirms logout and dispatches handleLogout flow", async () => {
    render(<AccountTab />);

    fireEvent.click(screen.getByTitle("Log out"));
    fireEvent.click(screen.getByText("Log out"));

    await waitFor(() => {
      expect(mockHandleLogout).toHaveBeenCalledWith({ request: mockRequest });
      expect(mockDispatch).toHaveBeenCalled();
    });
    expect(mockAddToast).toHaveBeenCalledWith("Logged out. Sign in again anytime.");
    expect(mockAddToastError).not.toHaveBeenCalled();
  });

  it("dispatches top-up thunk and opens checkout url", async () => {
    mockGetDesktopApiOrNull.mockReturnValue({ openExternal: mockOpenExternal });
    render(<AccountTab />);

    fireEvent.click(screen.getByText("Top Up"));

    await waitFor(() => {
      expect(mockCreateAddonCheckout).toHaveBeenCalledWith({ amountUsd: 10 });
      expect(mockOpenExternal).toHaveBeenCalledWith("https://stripe.test/checkout");
    });
  });

  it("dispatches auto top-up patch when toggle is changed", async () => {
    render(<AccountTab />);

    fireEvent.click(screen.getByText("Mock Auto Top-Up"));

    await waitFor(() => {
      expect(mockPatchAutoTopUpSettings).toHaveBeenCalledWith({ enabled: false });
      expect(mockDispatch).toHaveBeenCalled();
    });
  });

  it("shows validation toast and skips thunk on invalid amount", async () => {
    render(<AccountTab />);

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "0" } });
    fireEvent.click(screen.getByText("Top Up"));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith("Enter a valid amount");
    });
    expect(mockCreateAddonCheckout).not.toHaveBeenCalled();
  });

  it("shows error toast when top-up thunk fails", async () => {
    const failure = new Error("Top-up failed");
    mockDispatch.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue(failure),
    });

    render(<AccountTab />);
    fireEvent.click(screen.getByText("Top Up"));

    await waitFor(() => {
      expect(mockAddToastError).toHaveBeenCalledWith(failure);
    });
  });

  it("shows subscribe prompt when no subscription and status loaded", async () => {
    mockAuthState.subscription = null;
    mockAuthState.balance = null;
    mockAuthState.lastRefreshAt = Date.now();

    render(<AccountTab />);
    await waitFor(() => {
      expect(screen.getByText("Atomic Claw Subscription")).not.toBeNull();
      expect(screen.getByText(/Subscribe \$/)).not.toBeNull();
    });

    // Restore for other tests
    mockAuthState.subscription = {
      status: "active",
      currentPeriodEnd: "2026-03-01",
      stripeSubscriptionId: "sub_1",
    };
  });

  it("shows $0 red balance and depleted card when balance is near zero", () => {
    mockAuthState.subscription = {
      status: "active",
      currentPeriodEnd: "2026-03-01",
      stripeSubscriptionId: "sub_1",
    };
    mockAuthState.balance = { remaining: 0.01, limit: 10, usage: 9.99 };

    render(<AccountTab />);

    expect(screen.getByText("$0")).not.toBeNull();
    expect(screen.getByText("No credits left")).not.toBeNull();
    expect(screen.getByText("Top up to continue using AI.")).not.toBeNull();

    mockAuthState.subscription = {
      status: "active",
      currentPeriodEnd: "2026-03-01",
      stripeSubscriptionId: "sub_1",
    };
    mockAuthState.balance = null;
  });

  it("does not show depleted card when balance is above threshold", () => {
    mockAuthState.subscription = {
      status: "active",
      currentPeriodEnd: "2026-03-01",
      stripeSubscriptionId: "sub_1",
    };
    mockAuthState.balance = { remaining: 5, limit: 10, usage: 5 };

    render(<AccountTab />);

    expect(screen.queryByText("No credits left")).toBeNull();

    mockAuthState.balance = null;
  });

  it("does not handle addon-success deep link (handled globally by usePaidStatusBridge)", () => {
    let deepLinkCb:
      | ((payload: { host: string; pathname: string; params: Record<string, string> }) => void)
      | null = null;
    mockGetDesktopApiOrNull.mockReturnValue({
      openExternal: mockOpenExternal,
      onDeepLink: (cb: typeof deepLinkCb) => {
        deepLinkCb = cb;
        return () => {
          deepLinkCb = null;
        };
      },
    });

    render(<AccountTab />);
    // fetchBalance is called on mount; clear to isolate deep-link behavior
    mockFetchBalance.mockClear();

    expect(deepLinkCb).not.toBeNull();
    deepLinkCb!({ host: "addon-success", pathname: "/", params: {} });

    expect(mockFetchBalance).not.toHaveBeenCalled();
  });
});
