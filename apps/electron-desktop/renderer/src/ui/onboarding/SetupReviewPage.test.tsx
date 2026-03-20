// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import { SetupReviewPage } from "./SetupReviewPage";

const defaultProps = {
  totalSteps: 6,
  activeStep: 5,
  selectedModel: "GPT-5",
  subscriptionPrice: null as const,
  onPay: () => {},
  onBack: () => {},
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
  autoTopUpError: null as string | null,
  onAutoTopUpPatch: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@ui/app/UpgradePaywallContent", () => ({
  UpgradePaywallContent: () => <div data-testid="upgrade-paywall-content" />,
}));

function getFirstMain() {
  const mains = screen.getAllByRole("main", { name: "Setup review" });
  return mains[0];
}

describe("SetupReviewPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders header with Back, OnboardingDots and paywall content", () => {
    render(<SetupReviewPage {...defaultProps} />);

    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    const main = getFirstMain();
    expect(within(main).getByLabelText("Onboarding progress")).toBeTruthy();
    expect(screen.getByTestId("upgrade-paywall-content")).toBeTruthy();
    expect(screen.getByText("Upgrade to unlock all features")).toBeTruthy();
  });
});
