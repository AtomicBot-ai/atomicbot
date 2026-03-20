import React from "react";
import { captureRenderer, ANALYTICS_EVENTS } from "@analytics";
import type { OnboardingFlow } from "@ui/onboarding/hooks/onboarding-flow-context";

/**
 * Fires `onboarding_step` exactly once per component mount with the given
 * step name and flow. Use useRef guard (no sessionStorage) so every arrival
 * at a step is tracked — correct behavior for funnel analysis.
 */
export function useOnboardingStepEvent(step: string, flow: OnboardingFlow | null): void {
  const firedRef = React.useRef(false);
  React.useEffect(() => {
    if (firedRef.current) return;
    captureRenderer(ANALYTICS_EVENTS.onboardingStep, { step, flow });
    firedRef.current = true;
  }, []);
}
