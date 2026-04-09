/**
 * Hardcoded extra models injected into the renderer's model picker via IPC.
 * Only providers with forward-compat support in the gateway are listed here
 * (the gateway resolves unknown model IDs at request time, so models.json
 * entries are not required).
 *
 * Remove an entry once core adds the model natively.
 */

export type ExtraModelEntry = {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  reasoning?: boolean;
};

const EXTRA_MODELS: ExtraModelEntry[] = [
  {
    id: "qwen/qwen3.6-plus:free",
    name: "Qwen 3.6 Plus (free)",
    provider: "openrouter",
    contextWindow: 1_000_000,
    reasoning: true,
  },
  {
    id: "glm-5.1",
    name: "GLM-5.1",
    provider: "zai",
    contextWindow: 202_800,
    reasoning: true,
  },
];

export function getExtraModels(): ExtraModelEntry[] {
  return EXTRA_MODELS;
}
