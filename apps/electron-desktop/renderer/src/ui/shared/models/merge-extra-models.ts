import { getDesktopApiOrNull } from "@ipc/desktopApi";
import type { ModelEntry } from "./modelPresentation";

let cached: ModelEntry[] | null = null;

/** Load desktop-injected extra models (cached after the first call). */
export async function loadExtraModels(): Promise<ModelEntry[]> {
  if (cached) return cached;
  const api = getDesktopApiOrNull();
  if (!api?.extraModels) return [];
  try {
    cached = await api.extraModels();
    return cached;
  } catch {
    return [];
  }
}

/** Append extra models that are not already present in the gateway list. */
export function mergeExtraModels(
  gatewayModels: ModelEntry[],
  extraModels: ModelEntry[]
): ModelEntry[] {
  if (extraModels.length === 0) return gatewayModels;
  const seen = new Set(gatewayModels.map((m) => `${m.provider}/${m.id}`));
  const toAdd = extraModels.filter((m) => !seen.has(`${m.provider}/${m.id}`));
  return toAdd.length > 0 ? [...gatewayModels, ...toAdd] : gatewayModels;
}
