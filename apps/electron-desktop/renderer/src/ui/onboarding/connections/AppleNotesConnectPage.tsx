import { GlassCard, HeroPageLayout, PrimaryButton } from "@shared/kit";
import { OnboardingHeader } from "../OnboardingHeader";

export function AppleNotesConnectPage(props: {
  totalSteps: number;
  activeStep: number;
  status: string | null;
  error: string | null;
  busy: boolean;
  onCheckAndEnable: () => void;
  onBack: () => void;
}) {
  return (
    <HeroPageLayout
      variant="compact"
      align="center"
      aria-label="Apple Notes setup"
      context="onboarding"
    >
      <OnboardingHeader
        totalSteps={props.totalSteps}
        activeStep={props.activeStep}
        onBack={props.onBack}
        backDisabled={props.busy}
      />
      <GlassCard className="UiApiKeyCard UiGlassCardOnboarding">
        <div className="UiApiKeyTitle">Connect Apple Notes</div>
        <div className="UiApiKeySubtitle">Enable Apple Notes access via the bundled memo CLI.</div>

        <div className="UiSectionSubtitle">
          Notes:
          <ol>
            <li>macOS may prompt you to grant Automation access to Notes.app.</li>
            <li>
              If you deny access, Apple Notes actions will fail until you re-enable permissions.
            </li>
          </ol>
        </div>

        <div className="UiApiKeySpacer" aria-hidden="true" />

        <div className="UiApiKeyButtonRow">
          <div />
          <div className="flex-row-center">
            <PrimaryButton
              size="sm"
              disabled={props.busy}
              loading={props.busy}
              onClick={props.onCheckAndEnable}
            >
              {props.busy ? "Connecting..." : "Connect"}
            </PrimaryButton>
          </div>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
