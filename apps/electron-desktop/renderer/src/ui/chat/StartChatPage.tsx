import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useGatewayRpc } from "@gateway/context";
import type { GatewayState } from "@main/types";
import { dataUrlToBase64, type ChatAttachmentInput } from "@store/slices/chat/chatSlice";
import { getObject } from "@shared/utils/configHelpers";
import { ChatComposer, type ChatComposerRef } from "./components/ChatComposer";
import { useVoiceInput, getVoiceProvider } from "./hooks/useVoiceInput";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { upgradePaywallActions } from "@store/slices/upgradePaywallSlice";
import { downloadWhisperModel } from "@store/slices/whisperSlice";
import { addToastError } from "@shared/toast";
import { routes } from "../app/routes";
import ct from "./ChatTranscript.module.css";

function newSessionKey(): string {
  return `agent:main:main:${crypto.randomUUID().slice(0, 8)}`;
}

export function StartChatPage({
  state: _state,
}: {
  state: Extract<GatewayState, { kind: "ready" }>;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const gw = useGatewayRpc();
  const dispatch = useAppDispatch();
  const authMode = useAppSelector((s) => s.auth.mode);
  const subscription = useAppSelector((s) => s.auth.subscription);
  const needsUpgradePaywall =
    authMode === "paid" && (subscription === null || subscription.status === "canceled");
  const composerRef = React.useRef<ChatComposerRef | null>(null);
  const [input, setInput] = React.useState("");
  const [attachments, setAttachments] = React.useState<ChatAttachmentInput[]>([]);
  const [sending, setSending] = React.useState(false);

  // Focus on mount (e.g. first visit to main chat).
  React.useEffect(() => {
    const id = requestAnimationFrame(() => composerRef.current?.focusInput());
    return () => cancelAnimationFrame(id);
  }, []);

  // Focus when "New session" was clicked (works even when already on main chat).
  React.useEffect(() => {
    const focusRequested = (location.state as { focusComposer?: boolean } | null)?.focusComposer;
    if (!focusRequested) {
      return;
    }
    const id = requestAnimationFrame(() => composerRef.current?.focusInput());
    return () => cancelAnimationFrame(id);
  }, [location.state]);

  const voice = useVoiceInput(gw.request);
  const [voiceConfigured, setVoiceConfigured] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const savedProvider = getVoiceProvider();
    if (savedProvider === "local") {
      setVoiceConfigured(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await gw.request<{ config: unknown }>("config.get");
        if (cancelled) return;
        const cfg = getObject(snap.config);
        const auth = getObject(cfg.auth);
        const profiles = getObject(auth.profiles);
        const order = getObject(auth.order);
        const hasProfile = Object.values(profiles).some((p) => {
          if (!p || typeof p !== "object" || Array.isArray(p)) return false;
          return (p as { provider?: unknown }).provider === "openai";
        });
        const hasOrder = Object.prototype.hasOwnProperty.call(order, "openai");
        setVoiceConfigured(Boolean(hasProfile || hasOrder));
      } catch {
        setVoiceConfigured(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gw.request]);

  React.useEffect(() => {
    if (voice.error) {
      addToastError(voice.error);
    }
  }, [voice.error]);

  const handleVoiceStart = React.useCallback(() => {
    voice.startRecording();
  }, [voice]);

  const handleVoiceStop = React.useCallback(async () => {
    const text = await voice.stopRecording();
    if (text) {
      setInput((prev) => {
        const trimmed = prev.trim();
        return trimmed ? `${trimmed} ${text}` : text;
      });
    }
    requestAnimationFrame(() => composerRef.current?.focusInput());
  }, [voice]);

  const handleNavigateVoiceSettings = React.useCallback(() => {
    navigate("/settings/voice");
  }, [navigate]);

  const whisperDownload = useAppSelector((s) => s.whisper.download);

  const handleWhisperDownload = React.useCallback(() => {
    void dispatch(downloadWhisperModel("small"));
  }, [dispatch]);

  React.useEffect(() => {
    if (whisperDownload.kind === "idle" && getVoiceProvider() === "local") {
      setVoiceConfigured(true);
    }
  }, [whisperDownload]);

  const logoUrl = React.useMemo(() => {
    return new URL("../../assets/main-logo.png", document.baseURI).toString();
  }, []);

  const send = React.useCallback(async () => {
    const message = input.trim();
    const hasAttachments = attachments.length > 0;
    if ((!message && !hasAttachments) || sending) {
      return;
    }
    if (needsUpgradePaywall) {
      dispatch(upgradePaywallActions.open());
      return;
    }

    const sessionKey = newSessionKey();
    const runId = crypto.randomUUID();
    setSending(true);

    const apiAttachments =
      attachments.length > 0
        ? attachments
            .map((att) => {
              const parsed = dataUrlToBase64(att.dataUrl);
              if (!parsed) {
                return null;
              }
              const isImage = parsed.mimeType.startsWith("image/");
              return {
                type: isImage ? "image" : "file",
                mimeType: parsed.mimeType,
                content: parsed.content,
              };
            })
            .filter(
              (a): a is { type: "image" | "file"; mimeType: string; content: string } => a !== null
            )
        : undefined;

    try {
      await gw.request("chat.send", {
        sessionKey,
        message,
        deliver: false,
        idempotencyKey: runId,
        ...(apiAttachments?.length ? { attachments: apiAttachments } : {}),
      });
      setInput("");
      setAttachments([]);
      const title =
        message.length > 0
          ? message.length > 48
            ? `${message.slice(0, 48)}…`
            : message
          : `[${attachments.length} file(s)]`;
      void navigate(`${routes.chat}?session=${encodeURIComponent(sessionKey)}`, {
        replace: true,
        state: {
          optimisticNewSession: { key: sessionKey, title },
          pendingFirstMessage: message || title,
          pendingFirstAttachments: attachments.length > 0 ? attachments : undefined,
        },
      });
    } catch (err) {
      addToastError(err);
    } finally {
      setSending(false);
    }
  }, [dispatch, gw.request, input, navigate, sending, attachments, needsUpgradePaywall]);

  return (
    <div className={ct.UiChatShell}>
      <div className={ct.UiChatTranscript}>
        <div className={ct.UiChatEmpty}>
          <img className={ct.UiChatEmptyLogo} src={logoUrl} alt="" aria-hidden="true" />
          <div className={ct.UiChatEmptyTitle}>What can I help with?</div>
          <div className={ct.UiChatEmptySubtitle}>Send a message to start a conversation</div>
        </div>
      </div>

      <div className={ct.UiChatScrollToBottomWrap}>
        <ChatComposer
          ref={composerRef}
          value={input}
          onChange={setInput}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          onSend={() => void send()}
          disabled={sending}
          onAttachmentsLimitError={(msg) => addToastError(msg)}
          isVoiceRecording={voice.isRecording}
          isVoiceProcessing={voice.isProcessing}
          onVoiceStart={handleVoiceStart}
          onVoiceStop={handleVoiceStop}
          voiceNotConfigured={voiceConfigured === false}
          onNavigateVoiceSettings={handleNavigateVoiceSettings}
          whisperDownload={whisperDownload}
          onWhisperDownload={handleWhisperDownload}
        />
      </div>
    </div>
  );
}
