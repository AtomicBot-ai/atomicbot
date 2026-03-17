import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";

import { getDesktopApi } from "@ipc/desktopApi";
import type { SigmaDownloadProgress } from "../../../../src/shared/sigma/types";

export const useDownloadProgress = (addLog: (message: string) => void) => {
  const [downloadProgress, setDownloadProgress] = useState<SigmaDownloadProgress | null>(null);
  const [currentToastId, setCurrentToastId] = useState<string | null>(null);

  useEffect(() => {
    const api = getDesktopApi();
    const unsub = api.onSigmaDownloadProgress((progress) => {
      setDownloadProgress(progress);
      addLog(progress.message);
    });

    return unsub;
  }, [addLog]);

  useEffect(() => {
    if (downloadProgress && currentToastId) {
      const progressText =
        downloadProgress.percentage !== null
          ? `${downloadProgress.percentage.toFixed(1)}%`
          : `${(downloadProgress.downloaded / 1_048_576).toFixed(2)} MB`;

      toast.loading(`${downloadProgress.message} - ${progressText}`, {
        id: currentToastId,
      });
    }
  }, [downloadProgress, currentToastId]);

  return { downloadProgress, currentToastId, setCurrentToastId, setDownloadProgress };
};
