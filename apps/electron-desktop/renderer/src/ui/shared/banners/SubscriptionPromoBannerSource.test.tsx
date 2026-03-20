// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { SubscriptionPromoBannerSource } from "./SubscriptionPromoBannerSource";
import { BannerProvider, useBanners } from "./BannerContext";
import { BannerCarousel } from "./BannerCarousel";

const mockAuthState = {
  mode: "self-managed" as string | null,
};

const mockDispatch = vi.fn();
const mockNavigate = vi.fn();
const mockRequest = vi.fn();
const mockSwitchToSubscription = vi.fn();
const mockReloadConfig = vi.fn();

vi.mock("@store/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (st: unknown) => unknown) => selector({ auth: mockAuthState }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

const mockGatewayRpc = { request: mockRequest };
vi.mock("@gateway/context", () => ({
  useGatewayRpc: () => mockGatewayRpc,
}));

vi.mock("@store/slices/auth/authSlice", () => ({
  switchToSubscription: (payload: unknown) => mockSwitchToSubscription(payload),
}));

vi.mock("@store/slices/configSlice", () => ({
  reloadConfig: (payload: unknown) => mockReloadConfig(payload),
}));

vi.mock("@shared/toast", () => ({
  addToastError: vi.fn(),
}));

vi.mock("../../app/routes", () => ({
  routes: { settings: "/settings" },
}));

function TestHarness() {
  return (
    <BannerProvider>
      <SubscriptionPromoBannerSource />
      <BannerDisplay />
    </BannerProvider>
  );
}

function BannerDisplay() {
  const banners = useBanners();
  return <BannerCarousel items={banners} />;
}

describe("SubscriptionPromoBannerSource", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockAuthState.mode = "self-managed";
    mockDispatch.mockReset();
    mockNavigate.mockReset();
    mockSwitchToSubscription.mockReset();
    mockReloadConfig.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("does not show banner before 5-second delay", () => {
    const { container } = render(<TestHarness />);
    expect(container.querySelector("[role='status']")).toBeNull();
  });

  it("shows banner after 5 seconds when mode is self-managed", () => {
    render(<TestHarness />);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText("100+ AI Models. One Subscription.")).toBeTruthy();
    expect(screen.getByText("Try now")).toBeTruthy();
  });

  it("does not show banner when mode is paid", () => {
    mockAuthState.mode = "paid";
    render(<TestHarness />);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByText("100+ AI Models. One Subscription.")).toBeNull();
  });

  it("shows banner when mode is null (e.g. old backup without mode)", () => {
    mockAuthState.mode = null;
    render(<TestHarness />);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText("100+ AI Models. One Subscription.")).toBeTruthy();
  });

  it("dispatches switchToSubscription and navigates on Try now click", async () => {
    mockDispatch.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(undefined) });

    render(<TestHarness />);
    act(() => vi.advanceTimersByTime(5000));

    fireEvent.click(screen.getByText("Try now"));

    expect(mockSwitchToSubscription).toHaveBeenCalledWith({ request: mockRequest });
    expect(mockDispatch).toHaveBeenCalled();
  });

  it("hides banner permanently when dismiss button is clicked", () => {
    render(<TestHarness />);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText("100+ AI Models. One Subscription.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Dismiss banner/i }));
    expect(screen.queryByText("100+ AI Models. One Subscription.")).toBeNull();

    const dismissed = JSON.parse(localStorage.getItem("banner-dismissed") ?? "[]");
    expect(dismissed).toContain("subscription-promo");
  });

  it("does not show banner if previously dismissed persistently", () => {
    localStorage.setItem("banner-dismissed", JSON.stringify(["subscription-promo"]));
    render(<TestHarness />);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByText("100+ AI Models. One Subscription.")).toBeNull();
  });
});
