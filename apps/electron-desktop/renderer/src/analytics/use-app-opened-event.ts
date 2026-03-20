import React from "react";
import { captureRenderer, ANALYTICS_EVENTS } from "@analytics";
import { useAppSelector, useAppDispatch } from "@store/hooks";
import { useGatewayRpc } from "@gateway/context";
import { reloadConfig } from "@store/slices/configSlice";
import type { SetupMode } from "@store/slices/auth/auth-types";
import type { ConfigData } from "@store/slices/configSlice";

const SESSION_KEY = "oa_app_opened";

type ProviderType = "subscription" | "own_keys" | "none";

function deriveProviderInfo(
  mode: SetupMode | null,
  config: ConfigData | null | undefined
): { provider_type: ProviderType; provider: string } {
  if (mode === "paid") {
    return { provider_type: "subscription", provider: "none" };
  }
  if (mode === "self-managed") {
    // Pick first provider from auth.order that has configured profiles.
    const order = config?.auth?.order;
    const firstProvider =
      order && typeof order === "object"
        ? (Object.keys(order).find((k) => {
            const ids = order[k];
            return Array.isArray(ids) && ids.length > 0;
          }) ?? "none")
        : "none";
    return { provider_type: "own_keys", provider: firstProvider };
  }
  return { provider_type: "none", provider: "none" };
}

/**
 * Fires `app_opened` exactly once per Electron session when the user lands on
 * the chat screen and the gateway config has been loaded.
 *
 * Must be called from a component mounted inside GatewayRpcProvider.
 */
export function useAppOpenedEvent(): void {
  const firedRef = React.useRef(false);
  const dispatch = useAppDispatch();
  const { request } = useGatewayRpc();

  const mode = useAppSelector((s) => s.auth.mode);
  const configSnap = useAppSelector((s) => s.config.snap);
  const configStatus = useAppSelector((s) => s.config.status);

  // Kick off config load if not yet started.
  React.useEffect(() => {
    if (configStatus === "idle") {
      void dispatch(reloadConfig({ request }));
    }
  }, [configStatus, dispatch, request]);

  // Fire once when auth mode is known and config snapshot is available.
  React.useEffect(() => {
    if (firedRef.current) return;
    if (mode === null) return;
    if (configSnap === null) return;

    // sessionStorage resets on app restart — perfect guard for "once per start".
    if (sessionStorage.getItem(SESSION_KEY)) {
      firedRef.current = true;
      return;
    }

    const { provider_type, provider } = deriveProviderInfo(mode, configSnap.config);
    captureRenderer(ANALYTICS_EVENTS.appOpened, { provider_type, provider });
    sessionStorage.setItem(SESSION_KEY, "1");
    firedRef.current = true;
  }, [mode, configSnap]);
}
