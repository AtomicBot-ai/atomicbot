import type { GatewayState } from "@main/types";
import { FooterText, FullscreenShell, SpinningSplashLogo } from "@shared/kit";
import pkg from "../../../../package.json";

export function LoadingScreen({ state: _state }: { state: GatewayState | null }) {
  const appVersion = pkg.version || "0.0.0";

  return (
    <FullscreenShell role="status" aria-label="Loading">
      <div className="UiLoadingStage" aria-live="polite">
        <div className="UiLoadingCenter">
          <SpinningSplashLogo iconAlt="Atomic Bot" />
          <div>
            <div className="UiLoadingTitle">Your Agent is Loading...</div>
            <div className="UiLoadingSubtitle">
              First launch may take up to 5 minutes. Please wait.
            </div>
          </div>
        </div>
        <FooterText>Version {appVersion}</FooterText>
      </div>
    </FullscreenShell>
  );
}
