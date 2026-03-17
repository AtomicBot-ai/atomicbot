import { useState } from "react";
import { toast } from "react-hot-toast";

import { getDesktopApi } from "@ipc/desktopApi";
import type { SigmaServerStatus } from "../../../../src/shared/sigma/types";

interface UseServerControlProps {
  addLog: (message: string) => void;
  port: number;
  ctxSize: number;
  gpuLayers: number;
  status: SigmaServerStatus;
}

interface UseServerControlReturn {
  isBusy: boolean;
  handleStartServer: () => Promise<void>;
  handleStopServer: () => Promise<void>;
  handleClearAllData: () => Promise<void>;
}

export const useServerControl = ({
  addLog,
  port,
  ctxSize,
  gpuLayers,
  status,
}: UseServerControlProps): UseServerControlReturn => {
  const [isBusy, setIsBusy] = useState(false);

  const handleStartServer = async () => {
    if (isBusy) return;
    setIsBusy(true);

    addLog(`Starting LLM on port ${port} (ctx: ${ctxSize}, gpu layers: ${gpuLayers})...`);
    try {
      const api = getDesktopApi();
      const result = await api.sigmaStartServer();
      toast.success(result);
      addLog(result);
    } catch (error) {
      toast.error(`Error: ${error}`);
      addLog(`Error: ${error}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleStopServer = async () => {
    if (isBusy) return;
    setIsBusy(true);

    addLog("Stopping server...");
    try {
      const api = getDesktopApi();
      const result = await api.sigmaStopServer();
      toast.success(result);
      addLog(result);
    } catch (error) {
      toast.error(`Error: ${error}`);
      addLog(`Error: ${error}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleClearAllData = async () => {
    const toastId = toast.loading("Preparing to clear all data...");

    try {
      const api = getDesktopApi();

      if (status.is_running) {
        addLog("Stopping server before clearing data...");
        toast.loading("Stopping server first...", { id: toastId });

        try {
          await api.sigmaStopServer();
          addLog("Server stopped");
        } catch (error) {
          addLog(`Warning: Failed to stop server: ${error}`);
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      addLog("Clearing all data...");
      toast.loading("Clearing all data...", { id: toastId });

      const result = await api.sigmaClearAllData();
      toast.success(result, { id: toastId });
      addLog(result);
    } catch (error) {
      toast.error(`Error: ${error}`, { id: toastId });
      addLog(`Error: ${error}`);
    }
  };

  return {
    isBusy,
    handleStartServer,
    handleStopServer,
    handleClearAllData,
  };
};
