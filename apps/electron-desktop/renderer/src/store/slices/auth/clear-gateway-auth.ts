/**
 * Shared teardown helper for mode handlers.
 * Clears auth-profiles.json via IPC and resets gateway config (auth + model).
 */
import type { DesktopApi } from "@ipc/desktopApi";
import type { ConfigSnapshot } from "./auth-types";
import { getBaseHash } from "./auth-slice-helpers";

type RequestFn = <T = unknown>(method: string, params?: unknown) => Promise<T>;

export async function clearGatewayAuth(
  api: DesktopApi | null,
  request: RequestFn,
  extraPatch?: Record<string, unknown>,
  note?: string
): Promise<void> {
  if (api?.authWriteProfiles) {
    try {
      await api.authWriteProfiles({ profiles: {}, order: {} });
    } catch (err) {
      console.warn("[mode-switch] Failed to clear auth profiles:", err);
    }
  }

  try {
    const snap = await request<ConfigSnapshot>("config.get", {});
    const baseHash = getBaseHash(snap);
    if (baseHash) {
      const patch: Record<string, unknown> = {
        auth: { profiles: null, order: null },
        agents: { defaults: { model: { primary: "" } } },
        ...extraPatch,
      };
      await request("config.patch", {
        baseHash,
        raw: JSON.stringify(patch, null, 2),
        note: note ?? "Mode switch: clear gateway config",
      });
    }
  } catch (err) {
    console.warn("[mode-switch] Failed to clear gateway config:", err);
  }
}
