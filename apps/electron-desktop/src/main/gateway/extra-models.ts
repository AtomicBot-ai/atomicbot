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
    id: "glm-5-turbo",
    name: "GLM-5-Turbo",
    provider: "zai",
    contextWindow: 200_000,
    reasoning: true,
  },
];

export function getExtraModels(): ExtraModelEntry[] {
  return EXTRA_MODELS;
}
