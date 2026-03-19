/**
 * Single provider tile card used in the Providers & API Keys grid.
 * Extracted from ModelProvidersTab.tsx.
 *
 * @deprecated Part of the legacy Providers tab — scheduled for removal.
 */
import React from "react";

import type { ModelProviderInfo } from "@shared/models/providers";
import { resolveProviderIconUrl } from "@shared/models/providers";
import mp from "./ModelProvidersTab.module.css";

export const ProviderTile = React.memo(function ProviderTile(props: {
  provider: ModelProviderInfo;
  configured: boolean;
  onClick: () => void;
}) {
  const { provider, configured, onClick } = props;
  return (
    <div
      className="UiSkillCard"
      role="button"
      tabIndex={0}
      aria-label={`${provider.name}${configured ? " (configured)" : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="UiSkillTopRow">
        <span className="UiSkillIcon" aria-hidden="true">
          <img src={resolveProviderIconUrl(provider.id)} alt="" />
          {configured ? (
            <span className={mp.UiProviderTileCheck} aria-label="Key configured">
              ✓
            </span>
          ) : null}
        </span>
        {configured ? (
          <div className="UiSkillConnectButtonContainer">
            <button
              type="button"
              onClick={onClick}
              aria-label="Connected — click to configure"
              className="UiSkillConnectButton UiSkillConnectButtonConfigure"
            >
              Edit
            </button>
          </div>
        ) : (
          <button onClick={onClick} className="UiSkillConnectButton">
            Connect
          </button>
        )}
      </div>
      <div className="UiSkillName">
        {provider.name}
        {provider.localModels && <span className="UiProviderBadgeLocal">Local models</span>}
        {provider.privacyFirst && <span className="UiProviderBadgePrivacy">Privacy First</span>}
      </div>
      <div className="UiSkillDescription">{provider.description}</div>
    </div>
  );
});
