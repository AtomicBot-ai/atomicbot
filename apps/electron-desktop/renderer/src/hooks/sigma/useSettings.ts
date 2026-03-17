import { useState, useEffect } from "react";

import { getDesktopApi } from "@ipc/desktopApi";
import type {
  SigmaAppSettings,
  SigmaRecommendedSettings,
} from "../../../../src/shared/sigma/types";

interface UseSettingsProps {
  addLog: (message: string) => void;
}

interface UseSettingsReturn {
  baseModel: string;
  setBaseModel: (model: string) => void;
  isUncensored: boolean;
  setIsUncensored: (value: boolean) => void;
  port: number;
  ctxSize: number;
  gpuLayers: number;
  appDataPath: string;
  currentModel: string;
  handleCtxSizeChange: (newCtxSize: number) => Promise<void>;
  handleGpuLayersChange: (newGpuLayers: number) => Promise<void>;
  handleRestoreDefaults: () => Promise<void>;
}

export const useSettings = ({ addLog }: UseSettingsProps): UseSettingsReturn => {
  const [baseModel, setBaseModel] = useState("");
  const [isUncensored, setIsUncensored] = useState(false);
  const [port, setPort] = useState(10345);
  const [ctxSize, setCtxSize] = useState(6000);
  const [gpuLayers, setGpuLayers] = useState(41);
  const [appDataPath, setAppDataPath] = useState("");

  const currentModel = isUncensored ? `${baseModel}_uncensored` : baseModel;

  useEffect(() => {
    const loadSettings = async () => {
      const api = getDesktopApi();

      try {
        const settings: SigmaAppSettings = await api.sigmaGetSettings();

        const isUncensoredModel = settings.active_model.endsWith("_uncensored");
        const baseModelName = isUncensoredModel
          ? settings.active_model.replace("_uncensored", "")
          : settings.active_model;

        const savedUncensored = localStorage.getItem("isUncensored");
        const uncensored = savedUncensored === "true" || isUncensoredModel;

        setBaseModel(baseModelName);
        setIsUncensored(uncensored);
        setPort(settings.port);
        setCtxSize(settings.ctx_size);
        setGpuLayers(settings.gpu_layers);

        addLog(
          `Settings loaded: port=${settings.port}, ctx_size=${settings.ctx_size}, gpu_layers=${settings.gpu_layers}`
        );
        addLog(`Active model: ${settings.active_model}`);

        try {
          const recommended: SigmaRecommendedSettings = await api.sigmaGetRecommendedSettings();
          addLog(`System RAM: ${recommended.memory_gb} GB`);
        } catch {
          // Ignore
        }

        try {
          const currentModelName = uncensored ? `${baseModelName}_uncensored` : baseModelName;
          const isDownloaded = await api.sigmaCheckModel(currentModelName);

          if (isDownloaded) {
            await api.sigmaSetActiveModel(currentModelName);
          } else {
            const baseModelDownloaded = await api.sigmaCheckModel(baseModelName);

            if (baseModelDownloaded) {
              await api.sigmaSetActiveModel(baseModelName);
              addLog(`Active model set to: ${baseModelName}`);
            }
          }
        } catch (error) {
          console.error("Failed to set active model:", error);
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
        setBaseModel("model_s");
        addLog("Failed to load settings, using defaults");
      }
    };

    loadSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const api = getDesktopApi();
    api
      .sigmaGetAppDataPath()
      .then((path) => setAppDataPath(path))
      .catch((error: unknown) => console.error("Failed to get app data path:", error));
  }, []);

  const handleCtxSizeChange = async (newCtxSize: number) => {
    setCtxSize(newCtxSize);
    try {
      const api = getDesktopApi();
      await api.sigmaSetCtxSize(newCtxSize);
    } catch (error) {
      console.error("Failed to save ctx_size:", error);
    }
  };

  const handleGpuLayersChange = async (newGpuLayers: number) => {
    setGpuLayers(newGpuLayers);
    try {
      const api = getDesktopApi();
      await api.sigmaSetGpuLayers(newGpuLayers);
    } catch (error) {
      console.error("Failed to save gpu_layers:", error);
    }
  };

  const handleRestoreDefaults = async () => {
    try {
      const api = getDesktopApi();
      const recommended: SigmaRecommendedSettings = await api.sigmaGetRecommendedSettings();

      setCtxSize(recommended.recommended_ctx_size);
      setGpuLayers(recommended.recommended_gpu_layers);

      await api.sigmaSetCtxSize(recommended.recommended_ctx_size);
      await api.sigmaSetGpuLayers(recommended.recommended_gpu_layers);

      addLog(
        `Settings restored: ctx_size=${recommended.recommended_ctx_size}, gpu_layers=${recommended.recommended_gpu_layers}`
      );
    } catch (error) {
      console.error("Failed to restore defaults:", error);
      throw error;
    }
  };

  return {
    baseModel,
    setBaseModel,
    isUncensored,
    setIsUncensored,
    port,
    ctxSize,
    gpuLayers,
    appDataPath,
    currentModel,
    handleCtxSizeChange,
    handleGpuLayersChange,
    handleRestoreDefaults,
  };
};
