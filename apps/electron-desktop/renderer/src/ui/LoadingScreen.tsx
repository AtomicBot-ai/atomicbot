import React from "react";

import type { GatewayState } from "../../../src/main/types";
import { FooterText, FullscreenShell, SpinningSplashLogo } from "./kit";

export function LoadingScreen({ state: _state }: { state: GatewayState | null }) {
  const api = window.openclawDesktop;
  const appVersion = api?.version?.trim() ? api.version.trim() : "0.0.0";

  return (
    <FullscreenShell role="status" aria-label="Loading">
      <div className="UiLoadingStage" aria-live="polite">
        <div className="UiLoadingCenter">
          <SpinningSplashLogo iconAlt="Atomic Bot" />
          <div className="UiLoadingTitle">Your Agent is Loading...</div>
        </div>
        <FooterText>Version {appVersion}</FooterText>
      </div>
    </FullscreenShell>
  );
}

