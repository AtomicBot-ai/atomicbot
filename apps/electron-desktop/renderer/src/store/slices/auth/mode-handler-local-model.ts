/**
 * ModeHandler for the "local-model" mode.
 *
 * Follows the same lightweight pattern as paid/self-managed handlers:
 * setup() only configures auth + provider via config.patch.
 * Server start and model selection happen separately in the UI (handleSelect).
 */
import type { ModeHandler, SwitchContext, ModeSetupResult } from "./mode-switch";
import { clearGatewayAuth } from "./clear-gateway-auth";
import {
  readLocalModelBackup,
  saveLocalModelBackup,
  clearLocalModelBackup,
} from "./auth-persistence";
import { llamacppActions, stopLlamacppServer } from "../llamacppSlice";

const LLAMACPP_AUTH_PROFILES = {
  profiles: { "llamacpp:default": { provider: "llamacpp", mode: "api_key" } },
  order: { llamacpp: ["llamacpp:default"] },
};

export const localModelHandler: ModeHandler = {
  async saveBackup(ctx: SwitchContext): Promise<void> {
    const activeModelId = ctx.getState().llamacpp.activeModelId;
    console.log("[localModelHandler] saveBackup, activeModelId:", activeModelId ?? "none");
    if (activeModelId) {
      saveLocalModelBackup({
        activeModelId,
        savedAt: new Date().toISOString(),
      });
    }
  },

  async teardown(ctx: SwitchContext): Promise<void> {
    console.log("[localModelHandler] teardown start");
    try {
      await ctx.dispatch(stopLlamacppServer()).unwrap();
      console.log("[localModelHandler] stopLlamacppServer OK");
    } catch (err) {
      console.warn("[localModelHandler] stopLlamacppServer failed (may already be stopped):", err);
    }

    try {
      await ctx.api?.llamacppClearActiveModel?.();
      console.log("[localModelHandler] clearActiveModel OK");
    } catch (err) {
      console.warn("[localModelHandler] clearActiveModel failed:", err);
    }

    try {
      await ctx.api?.setSetupModeMarker?.();
      console.log("[localModelHandler] setSetupModeMarker cleared");
    } catch (err) {
      console.warn("[localModelHandler] setSetupModeMarker failed:", err);
    }

    ctx.dispatch(llamacppActions.setActiveModelId(null));
    ctx.dispatch(llamacppActions.setServerStatus("stopped"));

    await clearGatewayAuth(
      ctx.api,
      ctx.request,
      { models: { providers: { llamacpp: null } } },
      "Switch from local-model: clear llamacpp config"
    );
    console.log("[localModelHandler] teardown done");
  },

  async setup(ctx: SwitchContext): Promise<ModeSetupResult> {
    const backup = readLocalModelBackup();
    console.log("[localModelHandler] setup start, backup:", backup?.activeModelId ?? "none");

    // 1. Store API key in credentials
    if (ctx.api?.setApiKey) {
      try {
        await ctx.api.setApiKey("llamacpp", "LLAMACPP_LOCAL_KEY");
        console.log("[localModelHandler] setApiKey OK");
      } catch (err) {
        console.warn("[localModelHandler] Failed to set llamacpp API key:", err);
      }
    }

    // 2. Write auth profiles to auth-profiles.json so secrets.reload picks them up
    if (ctx.api?.authWriteProfiles) {
      try {
        await ctx.api.authWriteProfiles(LLAMACPP_AUTH_PROFILES);
        console.log("[localModelHandler] authWriteProfiles OK");
      } catch (err) {
        console.warn("[localModelHandler] Failed to write auth profiles:", err);
      }
    }

    // Config is NOT patched here — teardown triggers a gateway restart (1012),
    // so any RPC to the gateway would fail mid-restart.
    // The full config (auth + provider + model + primary) is applied later
    // by applyLocalModelConfig in handleSelect Phase 3, after the gateway is back.

    clearLocalModelBackup();
    console.log("[localModelHandler] setup done");
    return { hasBackup: !!backup };
  },
};
