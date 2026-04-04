import { useCallback, useEffect, useRef, useState } from "react";
import { DESKTOP_API_UNAVAILABLE, getDesktopApiOrNull } from "@ipc/desktopApi";
import { errorToMessage } from "@lib/error-format";
import { uint8ToBase64 } from "@shared/utils/base64";
import { useWavRecorder } from "./useWavRecorder";
export type { VoiceProvider } from "@lib/voice-storage";
export { getWhisperModel, getVoiceProvider, setVoiceProvider } from "@lib/voice-storage";
import { getVoiceProvider, getWhisperModel } from "@lib/voice-storage";

type GatewayRequest = <T = unknown>(method: string, params?: unknown) => Promise<T>;

export type UseVoiceInputResult = {
  startRecording: () => void;
  stopRecording: () => Promise<string | null>;
  cancelRecording: () => void;
  isRecording: boolean;
  error: string | null;
  isProcessing: boolean;
};

export function useVoiceInput(gwRequest: GatewayRequest): UseVoiceInputResult {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const providerRef = useRef<VoiceProvider>("openai");

  const wavRecorder = useWavRecorder();

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startRecording = useCallback(() => {
    setError(null);
    const provider = getVoiceProvider();
    providerRef.current = provider;

    if (provider === "local") {
      wavRecorder.startRecording();
      setIsRecording(true);
      return;
    }

    // OpenAI mode: record audio via MediaRecorder, transcribe on stop
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        mediaStreamRef.current = stream;
        chunksRef.current = [];

        const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };
        recorder.onerror = () => {
          setError("Recording failed");
          setIsRecording(false);
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
        setIsRecording(true);
      })
      .catch((err) => {
        setError(`Microphone access denied: ${errorToMessage(err)}`);
      });
  }, [wavRecorder]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (providerRef.current === "local") {
      setIsRecording(false);
      setIsProcessing(true);

      try {
        const wavData = await wavRecorder.stopRecording();
        if (!wavData || wavData.length === 0) {
          return null;
        }

        const api = getDesktopApiOrNull();
        if (!api?.whisperTranscribe) {
          setError(`${DESKTOP_API_UNAVAILABLE} for local transcription.`);
          return null;
        }

        const base64 = uint8ToBase64(wavData);
        const result = await api.whisperTranscribe({ audio: base64, model: getWhisperModel() });
        if (!result.ok) {
          setError(`Transcription failed: ${result.error ?? "unknown error"}`);
          return null;
        }
        return result.text?.trim() || null;
      } catch (err) {
        setError(`Transcription failed: ${errorToMessage(err)}`);
        return null;
      } finally {
        setIsProcessing(false);
      }
    }

    // OpenAI mode
    const recorder = mediaRecorderRef.current;
    const stream = mediaStreamRef.current;
    if (!recorder || recorder.state !== "recording") {
      setIsRecording(false);
      return null;
    }

    return new Promise<string | null>((resolve) => {
      recorder.onstop = async () => {
        stream?.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecording(false);

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];

        if (blob.size === 0) {
          resolve(null);
          return;
        }

        setIsProcessing(true);
        try {
          const arrayBuf = await blob.arrayBuffer();
          const bytes = new Uint8Array(arrayBuf);
          const base64 = uint8ToBase64(bytes);

          const result = await gwRequest<{ text: string; model?: string }>("audio.transcribe", {
            audio: base64,
            mime: "audio/webm",
            fileName: "recording.webm",
          });
          resolve(result.text?.trim() || null);
        } catch (err) {
          setError(`Transcription failed: ${errorToMessage(err)}`);
          resolve(null);
        } finally {
          setIsProcessing(false);
        }
      };
      recorder.stop();
    });
  }, [gwRequest, wavRecorder]);

  const cancelRecording = useCallback(() => {
    if (providerRef.current === "local") {
      wavRecorder.cancelRecording();
    } else {
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      chunksRef.current = [];
    }
    setIsRecording(false);
    setIsProcessing(false);
  }, [wavRecorder]);

  const combinedIsRecording = isRecording || wavRecorder.isRecording;
  const combinedError = error ?? wavRecorder.error;

  return {
    startRecording,
    stopRecording,
    cancelRecording,
    isRecording: combinedIsRecording,
    error: combinedError,
    isProcessing,
  };
}
