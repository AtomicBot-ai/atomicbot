import { useState, useEffect, useRef } from "react";
import { toast } from "react-hot-toast";

import { getDesktopApi } from "@ipc/desktopApi";
import type { SigmaDownloadProgress } from "../../../../src/shared/sigma/types";

interface UseAutoDownloadProps {
  modelName: string;
  addLog: (message: string) => void;
  setCurrentToastId: (id: string | null) => void;
  setDownloadProgress: (progress: SigmaDownloadProgress | null) => void;
}

export const useAutoDownload = ({
  modelName,
  addLog,
  setCurrentToastId,
  setDownloadProgress,
}: UseAutoDownloadProps) => {
  const [isDownloadingLlama, setIsDownloadingLlama] = useState(false);
  const [isDownloadingModel, setIsDownloadingModel] = useState(false);
  const [isModelAlreadyDownloaded, setIsModelAlreadyDownloaded] = useState(false);
  const [isLlamaAlreadyDownloaded, setIsLlamaAlreadyDownloaded] = useState(false);

  const llamaDownloadInProgress = useRef(false);
  const modelDownloadInProgress = useRef(false);
  const processedModels = useRef(new Set<string>());

  useEffect(() => {
    if (!modelName) return;

    if (processedModels.current.has(modelName)) return;
    processedModels.current.add(modelName);

    const checkAndDownloadFiles = async () => {
      const api = getDesktopApi();

      try {
        let wasSomeDownloads = false;

        let needsLlamaUpdate = false;
        let llamaExists = false;

        try {
          needsLlamaUpdate = await api.sigmaCheckLlamaVersion();
          llamaExists = true;
          if (!needsLlamaUpdate) {
            setIsLlamaAlreadyDownloaded(true);
          }
        } catch (error) {
          console.log("llama.cpp not found or check failed, will download", error);
          needsLlamaUpdate = true;
          llamaExists = false;
        }

        let modelExists = false;
        try {
          modelExists = await api.sigmaCheckModel(modelName);
          if (modelExists) {
            setIsModelAlreadyDownloaded(true);
          }
        } catch (error) {
          console.error("Failed to check model:", error);
        }

        if ((!llamaExists || needsLlamaUpdate) && !llamaDownloadInProgress.current) {
          wasSomeDownloads = true;
          llamaDownloadInProgress.current = true;

          const message = needsLlamaUpdate
            ? "llama.cpp update available, downloading new version..."
            : "llama.cpp not found, downloading automatically...";
          addLog(message);
          setIsDownloadingLlama(true);
          setDownloadProgress(null);

          const toastMessage = needsLlamaUpdate
            ? "Updating llama.cpp..."
            : "Starting llama.cpp download...";
          const toastId = toast.loading(toastMessage);
          setCurrentToastId(toastId);

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
            llamaDownloadInProgress.current = false;
          }
        }

        if (!modelExists && modelName && !modelDownloadInProgress.current) {
          wasSomeDownloads = true;
          modelDownloadInProgress.current = true;

          addLog(`Model '${modelName}' not found, downloading automatically...`);
          setIsDownloadingModel(true);
          setDownloadProgress(null);

          const toastId = toast.loading(`Starting model '${modelName}' download...`);
          setCurrentToastId(toastId);

          try {
            const result = await api.sigmaDownloadModel(modelName);
            toast.success(result, { id: toastId });
            addLog(result);

            await api.sigmaSetActiveModel(modelName);
            addLog(`Active model set to: ${modelName}`);
          } catch (error) {
            toast.error(`Error: ${error}`, { id: toastId });
            addLog(`Error: ${error}`);
          } finally {
            setIsDownloadingModel(false);
            setDownloadProgress(null);
            setCurrentToastId(null);
            modelDownloadInProgress.current = false;
          }
        }

        if (llamaExists && modelExists && wasSomeDownloads) {
          addLog("All required files are present");
          toast.success("System ready!");
        }
      } catch (error) {
        console.error("Failed to check files:", error);
        addLog(`Failed to check files: ${error}`);
      }
    };

    const timer = setTimeout(checkAndDownloadFiles, 500);
    return () => clearTimeout(timer);
  }, [modelName]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isDownloadingLlama,
    isDownloadingModel,
    isModelAlreadyDownloaded,
    isLlamaAlreadyDownloaded,
    setIsDownloadingLlama,
    setIsDownloadingModel,
  };
};
