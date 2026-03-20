import { OnboardingDots } from "@shared/kit";
import s from "./OnboardingHeader.module.css";

export type OnboardingHeaderProps = {
  totalSteps: number;
  activeStep: number;
  onBack?: () => void;
  onSkip?: () => void;
  backDisabled?: boolean;
};

export function OnboardingHeader({
  totalSteps,
  activeStep,
  onBack,
  onSkip,
  backDisabled,
}: OnboardingHeaderProps) {
  return (
    <div className={s.UiSetupHeader}>
      {onBack ? (
        <div className={s.UiSetupHeaderButton}>
          <button className="UiTextButton" type="button" onClick={onBack} disabled={backDisabled}>
            <div className={s.UiSetupButtonRow}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="M10 12L6 8L10 4"
                  stroke="currentColor"
                  stroke-width="1.33333"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              Back
            </div>
          </button>
        </div>
      ) : (
        <div className={s.UiSetupHeaderButton} />
      )}
      <div className={s.UiSetupHeaderCenter}>
        <OnboardingDots totalSteps={totalSteps} activeStep={activeStep} />
      </div>
      <div className={s.UiSetupHeaderRight}>
        {onSkip ? (
          <button className="UiTextButton" type="button" onClick={onSkip}>
            Skip
          </button>
        ) : (
          <div className={s.UiSetupHeaderButton} />
        )}
      </div>
    </div>
  );
}
