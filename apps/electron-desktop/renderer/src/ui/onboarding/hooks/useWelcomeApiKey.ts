import React from "react";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { patchAuthProfile } from "../../shared/utils/authProfiles";
import { setVoiceProvider } from "../../chat/hooks/useVoiceInput";
import type { Provider } from "../providers/ProviderSelectPage";
import type { ConfigSnapshot, GatewayRpcLike } from "./types";

type UseWelcomeApiKeyInput = {
  gw: GatewayRpcLike;
  loadConfig: () => Promise<ConfigSnapshot>;
  setError: (value: string | null) => void;
  setStatus: (value: string | null) => void;
  loadModels?: () => Promise<void>;
  refreshProviderFlags?: () => Promise<void>;
};

export function useWelcomeApiKey({
  gw,
  loadConfig,
  setError,
  setStatus,
  loadModels,
  refreshProviderFlags,
}: UseWelcomeApiKeyInput) {
  const saveApiKey = React.useCallback(
    async (provider: Provider, apiKey: string): Promise<boolean> => {
      if (!apiKey.trim()) {
        setError("API key is required.");
        return false;
      }
      setError(null);
      setStatus(`Saving ${provider} API key…`);
      await getDesktopApiOrNull()?.setApiKey(provider, apiKey.trim());

      // Update config with auth profile
      const snap = await loadConfig();
      const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
      if (!baseHash) {
        throw new Error("Config base hash missing. Reload and try again.");
      }
      await patchAuthProfile({
        gw,
        baseHash,
        provider,
        mode: "api_key",
        notePrefix: "Welcome",
      });
      // config.patch resets the model catalog cache but the gateway's in-memory
      // auth profile snapshot is still stale. Force a secrets reload so the
      // gateway re-reads credentials from disk before the caller fetches models.
      await gw.request("secrets.reload", {});
      setStatus(`${provider} API key saved.`);
      return true;
    },
    [gw, loadConfig, setError, setStatus]
  );

  const saveSetupToken = React.useCallback(
    async (provider: Provider, token: string): Promise<boolean> => {
      if (!token.trim()) {
        setError("Setup token is required.");
        return false;
      }
      setError(null);
      setStatus(`Saving ${provider} setup token…`);
      await getDesktopApiOrNull()?.setSetupToken(provider, token.trim());

      const snap = await loadConfig();
      const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
      if (!baseHash) {
        throw new Error("Config base hash missing. Reload and try again.");
      }
      await patchAuthProfile({
        gw,
        baseHash,
        provider,
        mode: "token",
        notePrefix: "Welcome",
      });
      await gw.request("secrets.reload", {});
      setStatus(`${provider} setup token saved.`);
      return true;
    },
    [gw, loadConfig, setError, setStatus]
  );

  const onMediaProviderKeySubmit = React.useCallback(
    async (provider: "openai", apiKey: string) => {
      // Save an additional provider key without re-running model selection flow.
      const ok = await saveApiKey(provider, apiKey);
      if (ok) {
        setVoiceProvider("openai");
        await loadModels?.();
        await refreshProviderFlags?.();
      }
      return ok;
    },
    [loadModels, refreshProviderFlags, saveApiKey]
  );

  return { saveApiKey, saveSetupToken, onMediaProviderKeySubmit };
}
