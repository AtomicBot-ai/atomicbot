/**
 * ModeHandler for the "local-model" mode.
 * Manages the local llama-server lifecycle and llamacpp gateway config.
 */
import type { ModeHandler, SwitchContext, ModeSetupResult } from "./mode-switch";
import { clearGatewayAuth } from "./mode-switch-utils";
import {
  readLocalModelBackup,
  saveLocalModelBackup,
  clearLocalModelBackup,
} from "./auth-persistence";
import {
  llamacppActions,
  stopLlamacppServer,
  startLlamacppServer,
  warmupLocalModel,
} from "../llamacppSlice";
import { applyLocalModelConfig } from "../llamacpp-config";

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
    let { modelId, modelName, contextLength } = ctx.extra;
    const backup = readLocalModelBackup();
    console.log(
      "[localModelHandler] setup start, modelId:",
      modelId ?? "none",
      "backup:",
      backup?.activeModelId ?? "none"
    );

    if (!modelId && backup?.activeModelId) {
      console.log(
        "[localModelHandler] restoring from backup, starting server:",
        backup.activeModelId
      );
      try {
        const serverResult = await ctx.dispatch(startLlamacppServer(backup.activeModelId)).unwrap();
        modelId = serverResult?.modelId ?? backup.activeModelId;
        modelName = serverResult?.modelName ?? modelName;
        contextLength = serverResult?.contextLength ?? contextLength;
        console.log("[localModelHandler] server restored OK, modelId:", modelId);
      } catch (err) {
        console.warn("[localModelHandler] server restore failed:", err);
      }
    }

    const cfgModelId = modelId ?? backup?.activeModelId ?? "local-model";
    const cfgModelName = modelName ?? "Local Model";

    if (ctx.api?.setApiKey) {
      try {
        await ctx.api.setApiKey("llamacpp", "LLAMACPP_LOCAL_KEY");
        console.log("[localModelHandler] setApiKey(llamacpp) OK");
      } catch (err) {
        console.warn("[localModelHandler] Failed to set llamacpp API key:", err);
      }
    }

    try {
      await applyLocalModelConfig({
        request: ctx.request,
        modelId: cfgModelId,
        modelName: cfgModelName,
        contextLength,
      });
      console.log(
        "[localModelHandler] applyLocalModelConfig OK:",
        cfgModelId,
        "ctx:",
        contextLength
      );
    } catch (err) {
      console.warn("[localModelHandler] Failed to patch config:", err);
    }

    // Fire-and-forget warmup to pre-fill the KV cache with the system prompt
    void ctx.dispatch(warmupLocalModel(ctx.request));

    clearLocalModelBackup();
    console.log("[localModelHandler] setup done, restoredModel:", `llamacpp/${cfgModelId}`);
    return { hasBackup: !!backup, restoredModel: `llamacpp/${cfgModelId}` };
  },
};
