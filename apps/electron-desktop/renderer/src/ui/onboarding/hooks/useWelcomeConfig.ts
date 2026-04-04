import React from "react";
import { errorToMessage } from "@shared/toast";
import type { GatewayState } from "@main/types";
import type { ConfigSnapshot, GatewayRpcLike } from "./types";
import { getObject, inferWorkspaceDirFromConfigPath } from "./onboarding-config-helpers";

type UseWelcomeConfigInput = {
  gw: GatewayRpcLike;
  state: Extract<GatewayState, { kind: "ready" }>;
  setError: (value: string | null) => void;
  setStatus: (value: string | null) => void;
  goProviderSelect: () => void;
  goSetupMode?: () => void;
};

export function useWelcomeConfig({
  gw,
  state,
  setError,
  setStatus,
  goProviderSelect,
  goSetupMode,
}: UseWelcomeConfigInput) {
  const [configPath, setConfigPath] = React.useState<string | null>(null);
  const [hasOpenAiProvider, setHasOpenAiProvider] = React.useState(false);
  const [startBusy, setStartBusy] = React.useState(false);

  const loadConfig = React.useCallback(async () => {
    const snap = await gw.request<ConfigSnapshot>("config.get", {});
    setConfigPath(typeof snap.path === "string" ? snap.path : null);
    return snap;
  }, [gw]);

  const ensureExtendedConfig = React.useCallback(async () => {
    setError(null);
    setStatus("Ensuring config…");
    const snap = await loadConfig();
    const cfg = getObject(snap.config);
    const gateway = getObject(cfg.gateway);
    const gatewayAuth = getObject(gateway.auth);
    const agents = getObject(cfg.agents);
    const defaults = getObject(agents.defaults);
    const hooks = getObject(cfg.hooks);
    const hooksInternal = getObject(hooks.internal);
    const hooksEntries = getObject(hooksInternal.entries);

    const currentWorkspace =
      typeof defaults.workspace === "string" ? defaults.workspace.trim() : "";
    const workspace = currentWorkspace || inferWorkspaceDirFromConfigPath(snap.path);

    const patch: Record<string, unknown> = {};

    const authToken = typeof gatewayAuth.token === "string" ? gatewayAuth.token.trim() : "";
    const authMode = typeof gatewayAuth.mode === "string" ? gatewayAuth.mode.trim() : "";
    const port =
      typeof gateway.port === "number" && Number.isFinite(gateway.port) ? gateway.port : null;
    const bind = typeof gateway.bind === "string" ? gateway.bind.trim() : "";
    const mode = typeof gateway.mode === "string" ? gateway.mode.trim() : "";
    const needsGateway =
      mode !== "local" ||
      bind !== "loopback" ||
      port !== state.port ||
      authMode !== "token" ||
      authToken !== state.token;
    if (needsGateway) {
      patch.gateway = {
        ...gateway,
        mode: "local",
        bind: "loopback",
        port: state.port,
        auth: {
          ...gatewayAuth,
          mode: "token",
          token: state.token,
        },
      };
    }

    if (!currentWorkspace) {
      patch.agents = {
        ...agents,
        defaults: {
          ...defaults,
          workspace,
        },
      };
    }

    // Enable recommended internal hooks by default on first-run config creation.
    // We only fill missing keys and avoid overriding explicit user choices.
    const internalEnabled =
      typeof hooksInternal.enabled === "boolean" ? hooksInternal.enabled : null;
    const shouldConsiderHooks = internalEnabled !== false;
    if (shouldConsiderHooks) {
      const nextEntries: Record<string, unknown> = { ...hooksEntries };
      const ensureEntry = (name: string) => {
        if (name in nextEntries) {
          return;
        }
        nextEntries[name] = { enabled: true };
      };
      ensureEntry("session-memory");
      ensureEntry("command-logger");

      const needsInternalEnabled = internalEnabled !== true;
      const needsEntries = Object.keys(nextEntries).length !== Object.keys(hooksEntries).length;
      if (needsInternalEnabled || needsEntries) {
        patch.hooks = {
          ...hooks,
          internal: {
            ...hooksInternal,
            enabled: internalEnabled === null ? true : hooksInternal.enabled,
            entries: nextEntries,
          },
        };
      }
    }

    if (snap.exists === false) {
      const seeded = { ...cfg, ...patch };
      await gw.request("config.set", { raw: JSON.stringify(seeded, null, 2) });
      setStatus("Config created.");
      return;
    }
    if (Object.keys(patch).length === 0) {
      setStatus("Config already looks good.");
      return;
    }
    const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
    if (!baseHash) {
      throw new Error("Config base hash missing. Reload and try again.");
    }

    // config.patch may trigger a SIGUSR1 gateway restart (when gateway.* paths
    // change), dropping the WebSocket mid-flight. Retry with backoff so the
    // onboarding flow survives transient restarts instead of showing "Setup failed".
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const freshSnap = attempt === 1 ? snap : await loadConfig();
        const freshHash =
          typeof freshSnap.hash === "string" && freshSnap.hash.trim()
            ? freshSnap.hash.trim()
            : null;
        if (!freshHash) {
          throw new Error("Config base hash missing after retry. Reload and try again.");
        }
        await gw.request("config.patch", {
          baseHash: freshHash,
          raw: JSON.stringify(patch, null, 2),
          note: "Welcome: ensure onboarding defaults (workspace/gateway)",
        });
        break;
      } catch (retryErr) {
        const msg = String(retryErr);
        const isRestart =
          msg.includes("1012") ||
          msg.includes("service restart") ||
          msg.includes("gateway closed") ||
          msg.includes("did not persist");
        if (!isRestart || attempt === maxAttempts) throw retryErr;
        setStatus(`Gateway restarting… retrying (${attempt}/${maxAttempts})`);
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
    setStatus("Config updated.");
  }, [gw, loadConfig, setError, setStatus, state.port, state.token]);

  const refreshProviderFlags = React.useCallback(async () => {
    try {
      const snap = await loadConfig();
      const cfg = getObject(snap.config);
      const auth = getObject(cfg.auth);
      const profiles = getObject(auth.profiles);
      const order = getObject(auth.order);
      const hasProfile = Object.values(profiles).some((p) => {
        if (!p || typeof p !== "object" || Array.isArray(p)) {
          return false;
        }
        return (p as { provider?: unknown }).provider === "openai";
      });
      const hasOrder = Object.prototype.hasOwnProperty.call(order, "openai");
      setHasOpenAiProvider(Boolean(hasProfile || hasOrder));
    } catch {
      // Best-effort; keep false on failures.
      setHasOpenAiProvider(false);
    }
  }, [loadConfig]);

  const start = React.useCallback(async () => {
    setError(null);
    setStatus(null);
    setStartBusy(true);
    try {
      await ensureExtendedConfig();
      // Navigate to setup mode selection (paid vs self-managed)
      if (goSetupMode) {
        goSetupMode();
      } else {
        goProviderSelect();
      }
    } catch (err) {
      setError(errorToMessage(err));
    } finally {
      setStartBusy(false);
    }
  }, [ensureExtendedConfig, goProviderSelect, goSetupMode, setError, setStatus]);

  return {
    configPath,
    ensureExtendedConfig,
    hasOpenAiProvider,
    loadConfig,
    refreshProviderFlags,
    start,
    startBusy,
  };
}
