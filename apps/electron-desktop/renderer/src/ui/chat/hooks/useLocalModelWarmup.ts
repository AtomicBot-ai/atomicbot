import React from "react";
import { useGatewayRpc } from "@gateway/context";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  warmupLocalModel,
  fetchLlamacppServerStatus,
  llamacppActions,
} from "@store/slices/llamacppSlice";
import { getDesktopApiOrNull } from "@ipc/desktopApi";

const SERVER_POLL_INTERVAL_MS = 2_000;
const SERVER_POLL_MAX_ATTEMPTS = 60;
const WARMUP_TIMEOUT_MS = 180_000;
const MAX_WARMUP_RETRIES = 5;
const WARMUP_RETRY_DELAY_MS = 3_000;

/**
 * Triggers a KV-cache warmup for local llama.cpp models.
 *
 * Warmup state is tracked in the main (Electron) process so that
 * renderer reloads (Cmd+R) do not re-trigger a completed warmup.
 *
 * Flow:
 * 1. Ask main process — if warmup "done", skip directly to "ready"
 * 2. Poll server health via IPC until llama-server is healthy
 * 3. Trigger warmup (sessions.create through gateway)
 * 4. Listen for first "delta" on the canonical session key → cache is warm
 */
export function useLocalModelWarmup(): void {
  const dispatch = useAppDispatch();
  const gw = useGatewayRpc();
  const authMode = useAppSelector((s) => s.auth.mode);
  const warmupStatus = useAppSelector((s) => s.llamacpp.warmupStatus);
  const warmupSessionKey = useAppSelector((s) => s.llamacpp.warmupSessionKey);
  const triggeredRef = React.useRef(false);
  const warmupRetryRef = React.useRef(0);

  // Phase 1: check main process warmup state (survives Cmd+R)
  React.useEffect(() => {
    if (authMode !== "local-model" || triggeredRef.current) return;

    const api = getDesktopApiOrNull();
    if (!api?.llamacppWarmupGet) return;

    void api.llamacppWarmupGet().then((mainState) => {
      if (triggeredRef.current) return;

      if (mainState.state === "done") {
        console.log("[warmup] main reports done, skipping warmup");
        triggeredRef.current = true;
        dispatch(llamacppActions.setWarmupStatus("ready"));
      }
    });
  }, [authMode, dispatch]);

  // Reset ref when mode changes or warmup is back to idle (model switched).
  // Must run BEFORE the polling effect so the ref is cleared before
  // Phase 2 re-evaluates on the same render cycle.
  React.useEffect(() => {
    if (authMode !== "local-model" || warmupStatus === "idle") {
      triggeredRef.current = false;
      warmupRetryRef.current = 0;
    }
  }, [authMode, warmupStatus]);

  // Phase 2: poll llama-server health via IPC, then trigger warmup
  React.useEffect(() => {
    if (authMode !== "local-model" || triggeredRef.current || warmupStatus !== "idle") return;

    const api = getDesktopApiOrNull();
    if (!api?.llamacppServerStatus) return;

    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled || triggeredRef.current || attempts >= SERVER_POLL_MAX_ATTEMPTS) return;
      attempts++;

      try {
        const status = await api.llamacppServerStatus();
        void dispatch(fetchLlamacppServerStatus());

        if (status.healthy && status.running) {
          // Wait for gateway config to have a llamacpp model as primary.
          // After mode-switch the gateway may still be applying the new config
          // (applyLocalModelConfig), so sessions.create would fall back to
          // the previous provider and fail.
          const snap = await gw.request<{ config?: Record<string, unknown> }>("config.get", {});
          const agents = snap?.config?.agents as Record<string, unknown> | undefined;
          const defaults = agents?.defaults as Record<string, unknown> | undefined;
          const model = defaults?.model as Record<string, unknown> | undefined;
          const primary = typeof model?.primary === "string" ? model.primary : "";

          const expectedPrimary = `llamacpp/${status.activeModelId}`;
          if (primary !== expectedPrimary) {
            console.log(
              "[warmup] server healthy but config not ready (primary=%s, expected=%s), waiting…",
              primary,
              expectedPrimary
            );
            return;
          }

          console.log(
            "[warmup] server healthy + config ready (primary=%s), triggering warmup",
            primary
          );
          if (cancelled || triggeredRef.current) return;
          triggeredRef.current = true;

          void api.llamacppWarmupSet?.({
            state: "warming",
            modelId: status.activeModelId,
          });
          void dispatch(warmupLocalModel(gw.request));
        }
      } catch (err) {
        console.warn("[warmup] server status poll error:", err);
      }
    };

    void poll();
    const id = setInterval(() => void poll(), SERVER_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [authMode, warmupStatus, dispatch, gw.request]);

  // Phase 3: listen for first token on the canonical warmup session key.
  // Gateway canonicalizes keys (e.g. "__warmup__" → "agent:default:__warmup__"),
  // so we must match on the canonical key returned by sessions.create.
  // On cleanup (model switch, mode change), delete the old warmup session.
  React.useEffect(() => {
    if (warmupStatus !== "warming" || !warmupSessionKey) return;

    const currentKey = warmupSessionKey;

    const timeout = setTimeout(() => {
      console.warn("[warmup] timed out waiting for first token");
      dispatch(llamacppActions.setWarmupStatus("error"));
      const api = getDesktopApiOrNull();
      void api?.llamacppWarmupSet?.({ state: "idle", modelId: null });
      void gw
        .request("sessions.delete", { key: currentKey })
        .catch((err) => console.warn("[warmup] sessions.delete (timeout):", err));
    }, WARMUP_TIMEOUT_MS);

    const markDone = () => {
      clearTimeout(timeout);
      dispatch(llamacppActions.setWarmupStatus("ready"));
      const api = getDesktopApiOrNull();
      void api?.llamacppWarmupGet?.().then((s) => {
        void api.llamacppWarmupSet?.({
          state: "done",
          modelId: s.modelId,
        });
      });
      void gw
        .request("sessions.delete", { key: currentKey })
        .catch((err) => console.warn("[warmup] sessions.delete (after success):", err));
    };

    console.log("[warmup] listening for events on session:", currentKey);

    const unsubscribe = gw.onEvent((evt) => {
      if (evt.event !== "chat") return;
      const payload = evt.payload as {
        sessionKey?: string;
        state?: string;
      };
      if (payload.sessionKey !== currentKey) return;

      if (payload.state === "delta" || payload.state === "final") {
        console.log("[warmup] prefill done (first token received), cache is warm");
        unsubscribe();
        markDone();
        return;
      }

      if (payload.state === "error" || payload.state === "aborted") {
        clearTimeout(timeout);
        unsubscribe();
        void gw
          .request("sessions.delete", { key: currentKey })
          .catch((err) => console.warn("[warmup] sessions.delete (run error):", err));

        const retryCount = warmupRetryRef.current;
        if (retryCount < MAX_WARMUP_RETRIES) {
          warmupRetryRef.current = retryCount + 1;
          console.warn(
            `[warmup] run failed (state=${payload.state}), scheduling retry ${retryCount + 1}/${MAX_WARMUP_RETRIES}`
          );
          setTimeout(() => {
            void dispatch(warmupLocalModel(gw.request));
          }, WARMUP_RETRY_DELAY_MS);
        } else {
          console.warn("[warmup] run failed, max retries exhausted");
          dispatch(llamacppActions.setWarmupStatus("error"));
          const api = getDesktopApiOrNull();
          void api?.llamacppWarmupSet?.({ state: "idle", modelId: null });
        }
      }
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
      void gw
        .request("sessions.delete", { key: currentKey })
        .catch((err) => console.warn("[warmup] sessions.delete (cleanup):", err));
    };
  }, [warmupStatus, warmupSessionKey, gw, dispatch]);
}
