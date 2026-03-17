import { toast } from "react-hot-toast";

import { getDesktopApi } from "@ipc/desktopApi";
import type { SigmaDownloadProgress } from "../../../../src/shared/sigma/types";

interface UseModelDownloadProps {
  baseModel: string;
  setIsUncensored: (value: boolean) => void;
  currentModel: string;
  isLlamaAlreadyDownloaded: boolean;
  isModelAlreadyDownloaded: boolean;
  setIsDownloadingLlama: (value: boolean) => void;
  setIsDownloadingModel: (value: boolean) => void;
  setDownloadProgress: (progress: SigmaDownloadProgress | null) => void;
  setCurrentToastId: (id: string | null) => void;
  addLog: (message: string) => void;
}

interface UseModelDownloadReturn {
  handleDownloadLlama: () => Promise<void>;
  handleDownloadModel: () => Promise<void>;
  handleUncensoredChange: (checked: boolean) => Promise<void>;
}

export const useModelDownload = ({
  baseModel,
  setIsUncensored,
  currentModel,
  isLlamaAlreadyDownloaded,
  isModelAlreadyDownloaded,
  setIsDownloadingLlama,
  setIsDownloadingModel,
  setDownloadProgress,
  setCurrentToastId,
  addLog,
}: UseModelDownloadProps): UseModelDownloadReturn => {
  const handleDownloadLlama = async () => {
    if (isLlamaAlreadyDownloaded) {
      toast.error("Llama already downloaded");
      return;
    }
    const api = getDesktopApi();
    setIsDownloadingLlama(true);
    setDownloadProgress(null);

    const toastId = toast.loading("Starting llama.cpp download...");
    setCurrentToastId(toastId);
    addLog("Starting llama.cpp download...");

    try {
      const result = await api.sigmaDownloadLlamaCpp();
      toast.success(result, { id: toastId });
      addLog(result);
    } catch (error) {
      toast.error(`Error: ${error}`, { id: toastId });
      addLog(`Error: ${error}`);
    } finally {
      setIsDownloadingLlama(false);
      setDownloadProgress(null);
      setCurrentToastId(null);
    }
  };

  const handleDownloadModel = async () => {
    if (isModelAlreadyDownloaded) {
      toast.error("Model already downloaded");
      return;
    }

    const api = getDesktopApi();
    setIsDownloadingModel(true);
    setDownloadProgress(null);

    const toastId = toast.loading(`Starting model '${currentModel}' download...`);
    setCurrentToastId(toastId);
    addLog(`Starting model '${currentModel}' download...`);

    try {
      const result = await api.sigmaDownloadModel(currentModel);
      toast.success(result, { id: toastId });
      addLog(result);

      await api.sigmaSetActiveModel(currentModel);
      addLog(`Set active model to: ${currentModel}`);
    } catch (error) {
      toast.error(`Error: ${error}`, { id: toastId });
      addLog(`Error: ${error}`);
    } finally {
      setIsDownloadingModel(false);
      setDownloadProgress(null);
      setCurrentToastId(null);
    }
  };

  const handleUncensoredChange = async (checked: boolean) => {
    setIsUncensored(checked);
    localStorage.setItem("isUncensored", checked.toString());

    const newModelName = checked ? `${baseModel}_uncensored` : baseModel;
    addLog(`Switching to ${checked ? "uncensored" : "censored"} model: ${newModelName}`);

    const api = getDesktopApi();

    try {
      const isDownloaded = await api.sigmaCheckModel(newModelName);

      if (!isDownloaded) {
        toast("Model not found, starting download...");
        setIsDownloadingModel(true);
        setDownloadProgress(null);

        const toastId = toast.loading(`Downloading model '${newModelName}'...`);
        setCurrentToastId(toastId);

        try {
          const result = await api.sigmaDownloadModel(newModelName);
          toast.success(result, { id: toastId });
          addLog(result);
        } catch (error) {
          toast.error(`Error: ${error}`, { id: toastId });
          addLog(`Error downloading: ${error}`);
          setIsUncensored(!checked);
          localStorage.setItem("isUncensored", (!checked).toString());
          return;
        } finally {
          setIsDownloadingModel(false);
          setDownloadProgress(null);
          setCurrentToastId(null);
        }
      }

      await api.sigmaSetActiveModel(newModelName);
      addLog(`Active model set to: ${newModelName}`);
      toast.success(`Switched to ${checked ? "uncensored" : "censored"} model`);
    } catch (error) {
      toast.error(`Error: ${error}`);
      addLog(`Error switching model: ${error}`);
      setIsUncensored(!checked);
      localStorage.setItem("isUncensored", (!checked).toString());
    }
  };

  return {
    handleDownloadLlama,
    handleDownloadModel,
    handleUncensoredChange,
  };
};
