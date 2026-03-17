import { useState } from "react";
import { toast } from "react-hot-toast";

import { useTheme } from "./useTheme";
import { useServerStatus } from "./useServerStatus";
import { useLogs } from "./useLogs";
import { useDownloadProgress } from "./useDownloadProgress";
import { useAutoDownload } from "./useAutoDownload";
import { useSettings } from "./useSettings";
import { useServerControl } from "./useServerControl";
import { useModelDownload } from "./useModelDownload";

export const useApp = () => {
  const { theme, toggleTheme } = useTheme();
  const status = useServerStatus();
  const { logs, addLog } = useLogs();
  const isProduction = import.meta.env.PROD;

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const {
    baseModel,
    isUncensored,
    setIsUncensored,
    port,
    ctxSize,
    gpuLayers,
    appDataPath,
    currentModel,
    handleCtxSizeChange,
    handleGpuLayersChange,
    handleRestoreDefaults: restoreDefaults,
  } = useSettings({ addLog });

  const { downloadProgress, setCurrentToastId, setDownloadProgress } = useDownloadProgress(addLog);

  const {
    isDownloadingLlama,
    isDownloadingModel,
    isModelAlreadyDownloaded,
    isLlamaAlreadyDownloaded,
    setIsDownloadingLlama,
    setIsDownloadingModel,
  } = useAutoDownload({
    modelName: currentModel,
    addLog,
    setCurrentToastId,
    setDownloadProgress,
  });

  const { isBusy, handleStartServer, handleStopServer, handleClearAllData } = useServerControl({
    addLog,
    port,
    ctxSize,
    gpuLayers,
    status,
  });

  const { handleDownloadLlama, handleDownloadModel, handleUncensoredChange } = useModelDownload({
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
  });

  const handleRestoreDefaults = async () => {
    try {
      await restoreDefaults();
      toast.success("Settings restored to defaults");
    } catch (error) {
      toast.error(`Error restoring defaults: ${error}`);
    }
  };

  return {
    theme,
    toggleTheme,
    status,
    logs,
    isProduction,
    isSettingsOpen,
    setIsSettingsOpen,
    baseModel,
    isUncensored,
    port,
    ctxSize,
    gpuLayers,
    appDataPath,
    currentModel,
    isDownloadingLlama,
    isDownloadingModel,
    downloadProgress,
    isBusy,
    handleCtxSizeChange,
    handleGpuLayersChange,
    handleRestoreDefaults,
    handleStartServer,
    handleStopServer,
    handleClearAllData,
    handleDownloadLlama,
    handleDownloadModel,
    handleUncensoredChange,
  };
};
