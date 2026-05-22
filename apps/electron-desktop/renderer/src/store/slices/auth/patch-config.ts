import type { ConfigSnapshot } from "./auth-types";
import { getBaseHash } from "./auth-slice-helpers";

type RequestFn = <T = unknown>(method: string, params?: unknown) => Promise<T>;

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function isGatewayRestartError(err: unknown): boolean {
  const msg = errorMessage(err);
  return (
    msg.includes("1012") ||
    msg.includes("service restart") ||
    msg.includes("gateway closed")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForGatewayReady(request: RequestFn): Promise<void> {
  const maxAttempts = 20;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await request("config.get", {});
      return;
    } catch (err) {
      const msg = errorMessage(err);

      // During restart the websocket/client may throw; while booting, RPC may be unavailable.
      const retryable =
        isGatewayRestartError(err) ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("startup") ||
        msg.includes("not ready") ||
        msg.includes("ECONNREFUSED");

      if (!retryable || attempt === maxAttempts) {
        throw err;
      }

      await sleep(Math.min(500 * attempt, 2000));
    }
  }
}

export async function patchConfigToleratingGatewayRestart(
  request: RequestFn,
  patch: Record<string, unknown>,
  note: string
): Promise<void> {
  const snap = await request<ConfigSnapshot>("config.get", {});
  const baseHash = getBaseHash(snap);

  if (!baseHash) {
    return;
  }

  try {
    await request("config.patch", {
      baseHash,
      raw: JSON.stringify(patch, null, 2),
      note,
    });
  } catch (err) {
    if (!isGatewayRestartError(err)) {
      throw err;
    }

    console.info("[mode-switch] config.patch triggered gateway restart; waiting for gateway");
    await waitForGatewayReady(request);
  }
}
