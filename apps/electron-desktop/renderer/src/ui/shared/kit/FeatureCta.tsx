/**
 * Shared status type used by both skill and connector cards.
 * Matches the `SkillStatus` / `ConnectorStatus` union.
 */
export type FeatureStatus = "connect" | "connected" | "disabled" | "coming-soon";

/**
 * A shared call-to-action button for feature cards (skills, connectors, etc.).
 * Renders "Edit" when connected, "Disabled" when disabled, "Coming Soon" as a
 * static badge, and a "Connect" button otherwise.
 */
export function FeatureCta({
  status,
  onConnect,
  onSettings,
}: {
  status: FeatureStatus;
  onConnect?: () => void;
  onSettings?: () => void;
}) {
  if (status === "connected") {
    return (
      <div className="UiSkillConnectButtonContainer">
        <button
          type="button"
          onClick={onSettings}
          aria-label="Connected — click to configure"
          className="UiSkillConnectButton UiSkillConnectButtonConfigure"
        >
          Edit
        </button>
      </div>
    );
  }
  if (status === "disabled") {
    return (
      <button
        className="UiSkillConnectButton"
        type="button"
        aria-label="Connect"
        onClick={onSettings}
      >
        Connect
      </button>
    );
  }
  if (status === "coming-soon") {
    return (
      <span className="UiSkillStatus UiSkillStatus--soon" aria-label="Coming soon">
        Coming Soon
      </span>
    );
  }
  return (
    <button
      className="UiSkillConnectButton"
      type="button"
      disabled={!onConnect}
      title={onConnect ? "Connect" : "Not available yet"}
      onClick={onConnect}
    >
      Connect
    </button>
  );
}
