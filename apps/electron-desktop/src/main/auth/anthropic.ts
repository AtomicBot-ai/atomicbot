import { upsertApiKeyProfile } from "../keys/apiKeys";

/**
 * Deprecated compatibility wrapper.
 *
 * This module is intentionally kept to avoid breaking older imports while the Electron app
 * evolves towards provider-agnostic key management.
 */
export function writeAuthProfilesAnthropicApiKey(params: { stateDir: string; apiKey: string }) {
  upsertApiKeyProfile({ stateDir: params.stateDir, provider: "anthropic", key: params.apiKey, profileName: "default" });
}

