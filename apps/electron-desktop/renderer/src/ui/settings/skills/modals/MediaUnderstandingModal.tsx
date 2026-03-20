import React from "react";

import sm from "./SkillModal.module.css";
import { ActionButton, CheckboxRow, InlineError, TextInput } from "@shared/kit";
import { errorToMessage } from "@shared/toast";
import { getObject } from "@shared/utils/configHelpers";
import { useWelcomeApiKey } from "@ui/onboarding/hooks/useWelcomeApiKey";
import type { ConfigSnapshot, GatewayRpcLike } from "@ui/onboarding/hooks/types";

/** Check if an OpenAI auth profile exists in the config. */
function detectOpenAiProvider(config: unknown): boolean {
  const cfg = getObject(config);
  const auth = getObject(cfg.auth);
  const profiles = getObject(auth.profiles);
  const order = getObject(auth.order);
  const hasProfile = Object.values(profiles).some((p) => {
    if (!p || typeof p !== "object" || Array.isArray(p)) {
      return false;
    }
    return (p as { provider?: unknown }).provider === "openai";
  });
  const hasOrder = Object.prototype.hasOwnProperty.call(order, "openai");
  return Boolean(hasProfile || hasOrder);
}

export function MediaUnderstandingModalContent(props: {
  gw: GatewayRpcLike;
  loadConfig: () => Promise<ConfigSnapshot>;
  isConnected: boolean;
  onConnected: () => void;
  onDisabled: () => void;
}) {
  const { gw, loadConfig, isConnected, onConnected, onDisabled } = props;
  const [image, setImage] = React.useState(true);
  const [audio, setAudio] = React.useState(true);
  const [video, setVideo] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [hasOpenAi, setHasOpenAi] = React.useState(false);
  const [openAiKey, setOpenAiKey] = React.useState("");
  const [keyBusy, setKeyBusy] = React.useState(false);
  const [keyError, setKeyError] = React.useState<string | null>(null);

  const { saveApiKey } = useWelcomeApiKey({
    gw,
    loadConfig,
    setError: setKeyError,
    setStatus,
  });

  // Detect OpenAI provider and pre-fill checkboxes from config.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await loadConfig();
        if (cancelled) {
          return;
        }
        const cfg = getObject(snap.config);
        setHasOpenAi(detectOpenAiProvider(cfg));

        if (isConnected) {
          const tools = getObject(cfg.tools);
          const media = getObject(tools.media);
          const img = getObject(media.image);
          const aud = getObject(media.audio);
          const vid = getObject(media.video);
          setImage(img.enabled === true);
          setAudio(aud.enabled === true);
          setVideo(vid.enabled === true);
        }
      } catch {
        // Best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, loadConfig]);

  const handleSaveKey = React.useCallback(async () => {
    setKeyBusy(true);
    setKeyError(null);
    try {
      const ok = await saveApiKey("openai", openAiKey);
      if (ok) {
        setOpenAiKey("");
        setHasOpenAi(true);
      }
    } catch (err) {
      setKeyError(errorToMessage(err));
    } finally {
      setKeyBusy(false);
    }
  }, [openAiKey, saveApiKey]);

  const handleSave = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    setStatus("Saving media understanding settings…");
    try {
      const snap = await loadConfig();
      const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
      if (!baseHash) {
        throw new Error("Config base hash missing. Reload and try again.");
      }
      await gw.request("config.patch", {
        baseHash,
        raw: JSON.stringify(
          {
            tools: {
              media: {
                image: { enabled: image },
                audio: { enabled: audio },
                video: { enabled: video },
              },
            },
          },
          null,
          2
        ),
        note: "Settings: configure media understanding",
      });
      setStatus("Media understanding enabled.");
      onConnected();
    } catch (err) {
      setError(errorToMessage(err));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [audio, gw, image, loadConfig, onConnected, video]);

  const canSave = image || audio || video;
  const needsKey = canSave && !hasOpenAi;

  return (
    <div className={sm.UiSkillModalContent}>
      <div className="UiSectionSubtitle">
        Transcribe voice messages, describe images, and summarize videos you send. Automatically
        picks a compatible provider based on your configured API keys.
      </div>
      {error && <InlineError>{error}</InlineError>}
      {status && <div className={sm.UiSkillModalStatus}>{status}</div>}

      <div className={sm.UiSkillModalField}>
        <CheckboxRow checked={image} onChange={setImage}>
          Image understanding (describe images, screenshots)
        </CheckboxRow>
        <CheckboxRow checked={audio} onChange={setAudio}>
          Audio understanding (transcribe voice messages)
        </CheckboxRow>
        <CheckboxRow checked={video} onChange={setVideo}>
          Video understanding (summarize and describe videos)
        </CheckboxRow>
      </div>

      {needsKey && (
        <div className={sm.UiSkillModalField}>
          <InlineError>
            OpenAI is not configured yet. Add an OpenAI API key to enable image + audio
            understanding reliably.
          </InlineError>
          {keyError && <InlineError>{keyError}</InlineError>}
          <label className={`${sm.UiSkillModalLabel} mt-sm`}>OpenAI API key</label>
          <TextInput
            type="password"
            value={openAiKey}
            onChange={setOpenAiKey}
            placeholder="sk-..."
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy || keyBusy}
          />
          <div className="flex-end mt-sm">
            <ActionButton
              disabled={busy || keyBusy || !openAiKey.trim()}
              onClick={() => void handleSaveKey()}
            >
              {keyBusy ? "Saving…" : "Save key"}
            </ActionButton>
          </div>
        </div>
      )}

      <div className={sm.UiSkillModalActions}>
        <ActionButton
          variant="primary"
          disabled={busy || !canSave || needsKey}
          onClick={() => void handleSave()}
        >
          {busy ? "Saving…" : "Save"}
        </ActionButton>
      </div>

      {isConnected && (
        <div className={sm.UiSkillModalDangerZone}>
          <button
            type="button"
            className={sm.UiSkillModalDisableButton}
            disabled={busy}
            onClick={onDisabled}
          >
            Disable
          </button>
        </div>
      )}
    </div>
  );
}
