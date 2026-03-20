import type { Provider } from "../providers/ProviderSelectPage";

export type ModelSelectBackTarget = "api-key" | "ollama-setup";

export function resolveModelSelectBackTarget(provider: Provider | null): ModelSelectBackTarget {
  return provider === "ollama" ? "ollama-setup" : "api-key";
}
