import { GlassCard, HeroPageLayout, PrimaryButton } from "@shared/kit";
import { OnboardingHeader } from "../OnboardingHeader";

export function AppleRemindersConnectPage(props: {
  totalSteps: number;
  activeStep: number;
  status: string | null;
  error: string | null;
  busy: boolean;
  onAuthorizeAndEnable: () => void;
  onBack: () => void;
}) {
  return (
    <HeroPageLayout
      variant="compact"
      align="center"
      aria-label="Apple Reminders setup"
      context="onboarding"
    >
      <OnboardingHeader
        totalSteps={props.totalSteps}
        activeStep={props.activeStep}
        onBack={props.onBack}
        backDisabled={props.busy}
      />
      <GlassCard className="UiApiKeyCard UiGlassCardOnboarding">
        <div className="UiApiKeyTitle">Connect Apple Reminders</div>
        <div className="UiApiKeySubtitle">
          Enable Reminders access via the bundled remindctl CLI.
        </div>

        <div className="UiSectionSubtitle">
          Notes:
          <ol>
            <li>macOS may prompt you to grant Automation access to Reminders.app.</li>
            <li>
              If you deny access, Reminders actions will fail until you re-enable permissions in
              System Settings.
            </li>
          </ol>
        </div>

        <div className="UiApiKeySpacer" aria-hidden="true" />

        <div className="UiApiKeyButtonRow">
          <div />
          <div className="flex-row-center">
            <PrimaryButton size="sm" disabled={props.busy} onClick={props.onAuthorizeAndEnable}>
              Connect
            </PrimaryButton>
          </div>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
