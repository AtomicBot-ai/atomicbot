/**
 * ModeHandler for the "paid" (subscription) mode.
 * Backs up JWT + credentials + config; restores from paid backup on setup.
 */
import { backendApi } from "@ipc/backendApi";
import type { ModeHandler, SwitchContext, ModeSetupResult } from "./mode-switch";
import { clearGatewayAuth } from "./clear-gateway-auth";
import type { ConfigSnapshot, PaidBackup } from "./auth-types";
import {
  readPersistedAuthToken,
  readPaidBackup,
  savePaidBackup,
  clearPaidBackup,
} from "./auth-persistence";
import { extractAuth, extractModel, getBaseHash } from "./auth-slice-helpers";

export const paidHandler: ModeHandler = {
  async saveBackup(ctx: SwitchContext): Promise<void> {
    if (readPaidBackup()) return;
    const authToken = readPersistedAuthToken();
    if (!authToken) return;

    let credentials: PaidBackup["credentials"] = { profiles: {}, order: {} };
    if (ctx.api?.authReadProfiles) {
      try {
        credentials = await ctx.api.authReadProfiles();
      } catch (err) {
        console.warn("[paidHandler] Failed to read auth profiles:", err);
      }
    }

    let configAuth: PaidBackup["configAuth"] = {};
    let configModel: PaidBackup["configModel"] = {};
    try {
      const snap = await ctx.request<ConfigSnapshot>("config.get", {});
      const cfg = (snap.config && typeof snap.config === "object" ? snap.config : {}) as Record<
        string,
        unknown
      >;
      configAuth = extractAuth(cfg);
      configModel = extractModel(cfg);
    } catch (err) {
      console.warn("[paidHandler] Failed to read config for backup:", err);
    }

    savePaidBackup({
      authToken,
      credentials,
      configAuth,
      configModel,
      savedAt: new Date().toISOString(),
    });
  },

  async teardown(ctx: SwitchContext): Promise<void> {
    await clearGatewayAuth(ctx.api, ctx.request, undefined, "Switch from paid: clear auth config");
  },

  async setup(ctx: SwitchContext): Promise<ModeSetupResult> {
    const backup = readPaidBackup();
    if (!backup) return {};

    let jwtValid = false;
    try {
      await backendApi.getStatus(backup.authToken.jwt);
      jwtValid = true;
    } catch {
      console.warn("[paidHandler] Backup JWT expired, discarding");
    }

    if (!jwtValid) {
      clearPaidBackup();
      return {};
    }

    if (ctx.api?.authWriteProfiles) {
      try {
        await ctx.api.authWriteProfiles({
          profiles: backup.credentials.profiles,
          order: backup.credentials.order,
        });
      } catch (err) {
        console.warn("[paidHandler] Failed to restore auth profiles:", err);
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
        };
        if (backup.configModel.primary) {
          patch.agents = {
            defaults: {
              model: { primary: backup.configModel.primary },
              models: backup.configModel.models ?? null,
            },
          };
        }
        await ctx.request("config.patch", {
          baseHash,
          raw: JSON.stringify(patch, null, 2),
          note: "Switch to paid: restore config from backup",
        });
      }
    } catch (err) {
      console.warn("[paidHandler] Failed to restore config:", err);
    }

    clearPaidBackup();
    return {
      hasBackup: true,
      restoredAuth: backup.authToken,
      restoredModel: backup.configModel.primary ?? null,
    };
  },
};
