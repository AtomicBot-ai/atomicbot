export const SELF_FLOW = {
  totalSteps: 6,
  steps: { auth: 0, provider: 1, apiKey: 2, model: 3, skills: 4, connections: 5 },
} as const;

export const PAID_FLOW = {
  totalSteps: 4,
  steps: { auth: 0, model: 1, skills: 2, connections: 3, },
} as const;

export const LOCAL_MODEL_FLOW = {
  totalSteps: 5,
  steps: { auth: 0, backendDownload: 1, modelSelect: 2, skills: 3, connections: 4 },
} as const;

export const RESTORE_FLOW = {
  totalSteps: 2,
  steps: { option: 0, file: 1 },
} as const;
