// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import React from "react";
import { renderHook } from "@testing-library/react";
import { OnboardingFlowContext, useOnboardingFlow } from "./onboarding-flow-context";

describe("OnboardingFlowContext", () => {
  it('defaults to "self-managed"', () => {
    const { result } = renderHook(() => useOnboardingFlow());
    expect(result.current).toBe("self-managed");
  });

  it('provides "paid" when wrapped in paid provider', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <OnboardingFlowContext.Provider value="paid">{children}</OnboardingFlowContext.Provider>
    );
    const { result } = renderHook(() => useOnboardingFlow(), { wrapper });
    expect(result.current).toBe("paid");
  });

  it('provides "self-managed" when explicitly set', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <OnboardingFlowContext.Provider value="self-managed">
        {children}
      </OnboardingFlowContext.Provider>
    );
    const { result } = renderHook(() => useOnboardingFlow(), { wrapper });
    expect(result.current).toBe("self-managed");
  });
});
