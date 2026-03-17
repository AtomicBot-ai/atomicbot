// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, within, cleanup } from "@testing-library/react";

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

  it("renders header with Back, Skip and paywall content", () => {
    render(<SetupReviewPage {...defaultProps} onSkip={() => {}} />);

    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    const main = getFirstMain();
    expect(within(main).getByRole("button", { name: "Skip" })).toBeTruthy();
    expect(screen.getByTestId("upgrade-paywall-content")).toBeTruthy();
    expect(screen.getByText("Upgrade to unlock all features")).toBeTruthy();
  });

  it("calls onSkip when Skip is clicked and onSkip is provided", () => {
    const onSkip = vi.fn();
    render(<SetupReviewPage {...defaultProps} onSkip={onSkip} />);

    const main = getFirstMain();
    fireEvent.click(within(main).getByRole("button", { name: "Skip" }));

    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("disables Skip button when onSkip is not provided", () => {
    render(<SetupReviewPage {...defaultProps} />);

    const main = getFirstMain();
    const skipButton = within(main).getByRole("button", { name: "Skip" });
    expect((skipButton as HTMLButtonElement).disabled).toBe(true);
  });
});
