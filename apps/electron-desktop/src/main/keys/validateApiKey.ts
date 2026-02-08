/**
 * Lightweight API key validation against each provider's real endpoint.
 * Makes a single cheap GET request (usually /models) and inspects the HTTP status.
 * 200 → valid, 401/403 → invalid, anything else → treated as a network/server error.
 */

const VALIDATION_TIMEOUT_MS = 10_000;

type ProviderValidationSpec = {
  url: string;
  headers: Record<string, string>;
};

function buildValidationSpec(provider: string, apiKey: string): ProviderValidationSpec | null {
  switch (provider) {
    case "anthropic":
      return {
        url: "https://api.anthropic.com/v1/models",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      };
    case "openai":
      return {
        url: "https://api.openai.com/v1/models",
        headers: { Authorization: `Bearer ${apiKey}` },
      };
    case "google":
      return {
        url: `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(apiKey)}`,
        headers: {},
      };
    case "openrouter":
      return {
        url: "https://openrouter.ai/api/v1/auth/key",
        headers: { Authorization: `Bearer ${apiKey}` },
      };
    case "zai":
      return {
        url: "https://open.bigmodel.cn/api/paas/v4/models",
        headers: { Authorization: `Bearer ${apiKey}` },
      };
    case "minimax":
      return {
        url: "https://api.minimax.chat/v1/models",
        headers: { Authorization: `Bearer ${apiKey}` },
      };
    default:
      return null;
  }
}

export async function validateProviderApiKey(
  provider: string,
  apiKey: string,
): Promise<{ valid: boolean; error?: string }> {
  const normalized = provider.trim().toLowerCase();
  const key = apiKey.trim();

  if (!normalized) {
    return { valid: false, error: "Provider is required." };
  }
  if (!key) {
    return { valid: false, error: "API key is required." };
  }

  const spec = buildValidationSpec(normalized, key);
  if (!spec) {
    // Unknown provider — skip validation, allow saving
    return { valid: true };
  }

  try {
    const res = await fetch(spec.url, {
      method: "GET",
      headers: spec.headers,
      signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
    });

    if (res.ok) {
      return { valid: true };
    }

    if (res.status === 401 || res.status === 403) {
      return { valid: false, error: "Invalid API key. Please check and try again." };
    }

    // Other HTTP errors (429, 500, etc.) — report but don't block
    return {
      valid: false,
      error: `Provider returned HTTP ${res.status}. The key may be valid but the service is temporarily unavailable.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("TimeoutError") || message.includes("abort")) {
      return { valid: false, error: "Validation timed out. Check your network connection." };
    }
    return { valid: false, error: `Could not reach provider: ${message}` };
  }
}
