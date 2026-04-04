/**
 * ModeHandler for the "self-managed" (API keys) mode.
 * Backs up credentials + config; restores from self-managed backup on setup.
 */
import type { ModeHandler, SwitchContext, ModeSetupResult } from "./mode-switch";
import { clearGatewayAuth } from "./clear-gateway-auth";
import type { ConfigSnapshot, SelfManagedBackup } from "./auth-types";
import { readBackup, saveBackup, clearBackup } from "./auth-persistence";
import { extractAuth, extractModel, getBaseHash } from "./auth-slice-helpers";

export const selfManagedHandler: ModeHandler = {
  async saveBackup(ctx: SwitchContext): Promise<void> {
    if (readBackup()) return;

    let credentials: SelfManagedBackup["credentials"] = { profiles: {}, order: {} };
    if (ctx.api?.authReadProfiles) {
      try {
        credentials = await ctx.api.authReadProfiles();
      } catch (err) {
        console.warn("[selfManagedHandler] Failed to read auth profiles:", err);
      }
    }

    let configAuth: SelfManagedBackup["configAuth"] = {};
    let configModel: SelfManagedBackup["configModel"] = {};
    try {
      const snap = await ctx.request<ConfigSnapshot>("config.get", {});
      const cfg = (snap.config && typeof snap.config === "object" ? snap.config : {}) as Record<
        string,
        unknown
      >;
      configAuth = extractAuth(cfg);
      configModel = extractModel(cfg);
    } catch (err) {
      console.warn("[selfManagedHandler] Failed to read config for backup:", err);
    }

    saveBackup({
      credentials,
      configAuth,
      configModel,
      savedAt: new Date().toISOString(),
    });
  },

  async teardown(ctx: SwitchContext): Promise<void> {
    await clearGatewayAuth(
      ctx.api,
      ctx.request,
      undefined,
      "Switch from self-managed: clear auth config"
    );
  },

  async setup(ctx: SwitchContext): Promise<ModeSetupResult> {
    const backup = readBackup();
    if (!backup) return { hasBackup: false };

    if (ctx.api?.authWriteProfiles) {
      try {
        await ctx.api.authWriteProfiles({
          profiles: backup.credentials.profiles,
          order: backup.credentials.order,
        });
      } catch (err) {
        console.warn("[selfManagedHandler] Failed to restore auth profiles:", err);
      }
    }

    try {
      const snap = await ctx.request<ConfigSnapshot>("config.get", {});
      const baseHash = getBaseHash(snap);
      if (baseHash) {
        const patch: Record<string, unknown> = {
          auth: {
            profiles: backup.configAuth.profiles ?? null,
            order: backup.configAuth.order ?? null,
          },
          agents: {
            defaults: {
              model: backup.configModel.primary
                ? { primary: backup.configModel.primary }
                : { primary: "" },
              models: backup.configModel.models ?? null,
            },
          },
        };
        await ctx.request("config.patch", {
          baseHash,
          raw: JSON.stringify(patch, null, 2),
          note: "Switch to self-managed: restore config from backup",
        });
      }
    } catch (err) {
      console.warn("[selfManagedHandler] Failed to restore config:", err);
    }

    clearBackup();
    return {
      hasBackup: true,
      restoredModel: backup.configModel.primary ?? null,
    };
  },
};
