import type { SigmaServerStatus } from "../../../../../src/shared/sigma/types";
import { StartButton } from "./StartButton";
import "./StatusPanel.css";

interface StatusPanelProps {
  status: SigmaServerStatus;
  onStartServer: () => void;
  onStopServer: () => void;
  isBusy: boolean;
}

export const StatusPanel = ({ status, onStartServer, onStopServer, isBusy }: StatusPanelProps) => {
  return (
    <div className="sigma-status">
      <div className="sigma-status-text">
        <div className="sigma-status-label">{status.is_running ? "Running" : "Stopped"}</div>
        <p className="sigma-status-message">{status.message}</p>
      </div>

      <StartButton
        isRunning={status.is_running}
        handleClick={status.is_running ? onStopServer : onStartServer}
        isBusy={isBusy}
      />
    </div>
  );
};
