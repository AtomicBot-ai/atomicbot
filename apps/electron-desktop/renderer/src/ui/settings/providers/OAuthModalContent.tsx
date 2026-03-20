/**
 * Modal content for OAuth-based model provider sign-in (e.g. OpenAI Codex).
 * Drives the OAuth flow via Electron IPC (main process) and opens the auth URL
 * in the system browser automatically.
 *
 * @deprecated Part of the legacy Providers tab — scheduled for removal.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { useGatewayRpc } from "@gateway/context";
import { openExternal } from "@shared/utils/openExternal";
import { ActionButton } from "@shared/kit";
import { errorToMessage } from "@shared/toast";
import type { ModelProviderInfo } from "@shared/models/providers";
import { resolveProviderIconUrl } from "@shared/models/providers";
import s from "./ApiKeyModalContent.module.css";

type OAuthState = "idle" | "waiting" | "signing-in" | "saving" | "done" | "error";

export function OAuthModalContent(props: {
  provider: ModelProviderInfo;
  configHash: string | null;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const { provider, configHash, onSuccess, onClose } = props;
  const gw = useGatewayRpc();
  const [state, setState] = useState<OAuthState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const abortRef = useRef(false);

  const startOAuth = useCallback(async () => {
    const desktopApi = getDesktopApiOrNull();
    if (!desktopApi) {
      setError("Desktop API is not available.");
      setState("error");
      return;
    }

    abortRef.current = false;
    setState("waiting");
    setError(null);
    setProgressMsg(null);

    // Listen for progress events from the main process.
    const unsub = desktopApi.onOAuthProgress((payload) => {
      if (payload.provider === provider.id) {
        setState("signing-in");
        setProgressMsg(payload.message);
      }
    });

    try {
      // The main process opens the browser and handles the full OAuth flow.
      const result = await desktopApi.oauthLogin(provider.id);
      unsub();

      if (abortRef.current) {
        return;
      }

      if (result?.ok && result.profileId) {
        setState("saving");

        // Update config with auth profile entry via config.patch (same
        // pattern as saveApiKey) so the provider shows as configured.
        if (configHash) {
          try {
            const providerId = result.profileId.split(":")[0] ?? "";
            await gw.request("config.patch", {
              baseHash: configHash,
              raw: JSON.stringify(
                {
                  auth: {
                    profiles: {
                      [result.profileId]: { provider: providerId, mode: "oauth" },
                    },
                    order: {
                      [providerId]: [result.profileId],
                    },
                  },
                },
                null,
                2
              ),
              note: `Settings: enable ${providerId} oauth profile`,
            });
            await gw.request("secrets.reload", {});
          } catch {
            // Non-fatal: credentials are already stored in auth-profiles.json.
          }
        }

        setState("done");
        onSuccess();
      } else {
        setState("error");
        setError("OAuth flow did not complete successfully.");
      }
    } catch (err: unknown) {
      unsub();
      if (abortRef.current) {
        return;
      }
      setState("error");
      setError(errorToMessage(err));
    }
  }, [configHash, gw, onSuccess, provider.id]);

  useEffect(() => {
    return () => {
      abortRef.current = true;
    };
  }, []);

  const isBusy = state === "waiting" || state === "signing-in" || state === "saving";

  const statusText = (() => {
    switch (state) {
      case "waiting":
        return progressMsg ?? "Starting OAuth flow\u2026";
      case "signing-in":
        return progressMsg ?? "Waiting for sign-in in browser\u2026";
      case "saving":
        return "Saving credentials\u2026";
      case "done":
        return "Connected!";
      default:
        return null;
    }
  })();

  return (
    <>
      <div className={s.UiModalProviderHeader}>
        {provider?.helpTitle ? (
          <span>{provider.helpTitle}</span>
        ) : (
          <>
            <span className={s.UiModalProviderIcon} aria-hidden="true">
              <img src={resolveProviderIconUrl(provider.id)} alt="" />
            </span>
            <span className={s.UiModalProviderName}>{provider.name}</span>
          </>
        )}
      </div>

      <div className={s.UiModalHelpText}>
        {provider.helpText}{" "}
        {provider.helpUrl ? (
          <a
            href={provider.helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="UiLink"
            onClick={(e) => {
              e.preventDefault();
              if (provider.helpUrl) {
                openExternal(provider.helpUrl);
              }
            }}
          >
            Learn more ↗
          </a>
        ) : null}
      </div>

      {statusText && (
        <div className={s.UiModalHelpText} style={{ marginBottom: 8 }}>
          {statusText}
        </div>
      )}

      {error && (
        <div style={{ color: "var(--color-danger, #f44)", fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className={s.UiModalActions}>
        <ActionButton disabled={isBusy} onClick={onClose}>
          {state === "done" ? "Close" : "Cancel"}
        </ActionButton>
        {state !== "done" && (
          <ActionButton
            variant="primary"
            disabled={isBusy}
            loading={isBusy}
            onClick={() => void startOAuth()}
          >
            {state === "error" ? "Retry" : isBusy ? "Signing in\u2026" : "Continue with ChatGPT"}
          </ActionButton>
        )}
      </div>
    </>
  );
}
