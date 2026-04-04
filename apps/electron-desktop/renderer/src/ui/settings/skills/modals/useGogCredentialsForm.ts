import React from "react";
import { DESKTOP_API_UNAVAILABLE, getDesktopApiOrNull } from "@ipc/desktopApi";
import { errorToMessage } from "@shared/toast";

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

export function useGogCredentialsForm(isConnected: boolean) {
  const [credentialsJson, setCredentialsJson] = React.useState("");
  const [credentialsBusy, setCredentialsBusy] = React.useState(false);
  const [credentialsError, setCredentialsError] = React.useState<string | null>(null);
  const [credentialsSet, setCredentialsSet] = React.useState(isConnected);
  const [showCredentials, setShowCredentials] = React.useState(!isConnected);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleSetCredentials = React.useCallback(async () => {
    const trimmed = credentialsJson.trim();
    if (!trimmed) return;
    const api = getDesktopApiOrNull();
    if (!api) {
      setCredentialsError(DESKTOP_API_UNAVAILABLE);
      return;
    }
    setCredentialsError(null);
    setCredentialsBusy(true);
    try {
      const res = await api.gogAuthCredentials({ credentialsJson: trimmed });
      if (res.ok) {
        setCredentialsSet(true);
        setShowCredentials(false);
      } else {
        setCredentialsError(res.stderr?.trim() || "Failed to set credentials");
      }
    } catch (err) {
      setCredentialsError(errorToMessage(err));
    } finally {
      setCredentialsBusy(false);
    }
  }, [credentialsJson]);

  const handleFilePick = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      setCredentialsJson(text);
    } catch {
      // Best-effort.
    }
    e.target.value = "";
  }, []);

  const toggleShowCredentials = React.useCallback(() => {
    setShowCredentials((prev) => !prev);
  }, []);

  return {
    credentialsJson,
    setCredentialsJson,
    credentialsBusy,
    credentialsError,
    credentialsSet,
    showCredentials,
    toggleShowCredentials,
    fileInputRef,
    handleSetCredentials,
    handleFilePick,
  };
}
