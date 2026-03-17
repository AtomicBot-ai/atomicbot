import type { SigmaDownloadProgress } from "../../../../../src/shared/sigma/types";
import "./ProgressBar.css";

interface ProgressBarProps {
  downloadProgress: SigmaDownloadProgress | null;
}

export const ProgressBar = ({ downloadProgress }: ProgressBarProps) => {
  if (!downloadProgress) return null;

  return (
    <div className="sigma-progress">
      <div className="sigma-progress-bar">
        <div
          className="sigma-progress-fill"
          style={{ width: `${downloadProgress.percentage || 0}%` }}
        />
      </div>
      <div className="sigma-progress-text">
        {downloadProgress.percentage !== null
          ? `${downloadProgress.percentage.toFixed(1)}%`
          : "Downloading..."}
      </div>
    </div>
  );
};
