export function OnboardingDots({
  totalSteps,
  activeStep,
}: {
  totalSteps: number;
  activeStep: number;
}) {
  return (
    <div className="UiOnboardingDots" aria-label="Onboarding progress">
      {Array.from({ length: totalSteps }).map((_, idx) => (
        <span
          key={idx}
          className={`UiOnboardingDot ${idx === activeStep ? "UiOnboardingDot--active" : ""}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
