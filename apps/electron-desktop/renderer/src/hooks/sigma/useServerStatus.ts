import { useState, useEffect } from "react";

import { getDesktopApi } from "@ipc/desktopApi";
import type { SigmaServerStatus } from "../../../../src/shared/sigma/types";

export const useServerStatus = () => {
  const [status, setStatus] = useState<SigmaServerStatus>({
    is_running: false,
    message: "Not running",
  });

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const api = getDesktopApi();
        const serverStatus = await api.sigmaGetServerStatus();
        setStatus(serverStatus);
      } catch (error) {
        console.error("Failed to get status:", error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return status;
};
