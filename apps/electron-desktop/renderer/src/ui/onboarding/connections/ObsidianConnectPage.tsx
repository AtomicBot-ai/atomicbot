import { GlassCard, HeroPageLayout, PrimaryButton, SecondaryButton } from "@shared/kit";
import { OnboardingHeader } from "../OnboardingHeader";

type ObsidianVault = {
  name: string;
  path: string;
  open: boolean;
};

export function ObsidianConnectPage(props: {
  totalSteps: number;
  activeStep: number;
  status: string | null;
  error: string | null;
  busy: boolean;
  vaults: ObsidianVault[];
  selectedVaultName: string;
  setSelectedVaultName: (value: string) => void;
  vaultsLoading: boolean;
  onSetDefaultAndEnable: (vaultName: string) => void;
  onRecheck: () => void;
  onBack: () => void;
}) {
  const selected = props.selectedVaultName;

  return (
    <HeroPageLayout
      variant="compact"
      align="center"
      aria-label="Obsidian setup"
      context="onboarding"
    >
      <OnboardingHeader
        totalSteps={props.totalSteps}
        activeStep={props.activeStep}
        onBack={props.onBack}
        backDisabled={props.busy}
      />
      <GlassCard className="UiApiKeyCard UiGlassCardOnboarding">
        <div className="UiApiKeyTitle">Connect Obsidian</div>

        <div className="UiContentWrapper scrollable">
          <div className="UiApiKeySubtitle">
            Enable Obsidian vault automation via the bundled obsidian-cli.
          </div>

          <div className="UiSectionSubtitle">
            Notes:
            <ol>
              <li>Select a vault below. We'll set it as the default for future commands.</li>
              <li>
                Connected means obsidian-cli print-default --path-only returns a vault path that
                exists.
              </li>
            </ol>
          </div>

          <div className="UiApiKeyInputRow">
            <div className="UiSectionSubtitle mb-sm">Vault</div>
            <select
              className="UiInput"
              disabled={props.busy || props.vaultsLoading || props.vaults.length === 0}
              value={selected}
              onChange={(e) => props.setSelectedVaultName(e.target.value)}
            >
              {props.vaults.length === 0 ? (
                <option value="">
                  {props.vaultsLoading ? "Loading vaults..." : "No vaults found"}
                </option>
              ) : (
                <>
                  <option value="" disabled>
                    Select a vault…
                  </option>
                  {props.vaults.map((v) => (
                    <option key={`${v.name}:${v.path}`} value={v.name}>
                      {v.open ? `• ${v.name}` : v.name}
                    </option>
                  ))}
                </>
              )}
            </select>
            {selected ? <div className="UiSectionSubtitle mt-sm">Selected: {selected}</div> : null}
          </div>

          {/*{props.status ? <div className="UiSectionSubtitle">{props.status}</div> : null}*/}

          <div className="UiApiKeySpacer" aria-hidden="true" />
        </div>

        <div className="UiApiKeyButtonRow">
          <div />
          <div className="flex-row-center">
            <SecondaryButton
              size="sm"
              disabled={props.busy || props.vaultsLoading || !selected}
              onClick={() => props.onSetDefaultAndEnable(selected)}
            >
              {props.busy ? "Setting..." : "Set default & enable"}
            </SecondaryButton>
            <SecondaryButton
              disabled={props.busy || props.vaultsLoading}
              onClick={props.onRecheck}
              size="sm"
            >
              {props.busy ? "Checking..." : "Re-check"}
            </SecondaryButton>
            <PrimaryButton disabled={props.busy} onClick={props.onBack} size="sm">
              Done
            </PrimaryButton>
          </div>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
