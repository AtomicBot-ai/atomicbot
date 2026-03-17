import { useState, useEffect } from "react";

import type {
  SigmaDownloadProgress,
  SigmaServerStatus,
} from "../../../../../src/shared/sigma/types";
import { ProgressBar } from "./ProgressBar";
import "./SettingsPanel.css";

interface SettingsPanelProps {
  isOpen: boolean;
  appDataPath: string;
  baseModel: string;
  isUncensored: boolean;
  ctxSize: number;
  gpuLayers: number;
  isDownloadingLlama: boolean;
  isDownloadingModel: boolean;
  downloadProgress: SigmaDownloadProgress | null;
  status: SigmaServerStatus;
  onClose: () => void;
  onDownloadLlama: () => void;
  onDownloadModel: () => void;
  onUncensoredChange: (checked: boolean) => void;
  onCtxSizeChange: (ctxSize: number) => void;
  onGpuLayersChange: (gpuLayers: number) => void;
  onRestoreDefaults: () => void;
  onClearAllData: () => void;
  isProduction: boolean;
}

export const SettingsPanel = ({
  isOpen,
  appDataPath,
  baseModel,
  isUncensored,
  ctxSize,
  gpuLayers,
  isDownloadingLlama,
  isDownloadingModel,
  downloadProgress,
  onClose,
  onDownloadLlama,
  onDownloadModel,
  onUncensoredChange,
  onCtxSizeChange,
  onGpuLayersChange,
  onRestoreDefaults,
  onClearAllData,
  isProduction,
}: SettingsPanelProps) => {
  const [ctxSizeValue, setCtxSizeValue] = useState(ctxSize.toString());
  const [gpuLayersValue, setGpuLayersValue] = useState(gpuLayers.toString());
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    setCtxSizeValue(ctxSize.toString());
  }, [ctxSize]);

  useEffect(() => {
    setGpuLayersValue(gpuLayers.toString());
  }, [gpuLayers]);

  if (!isOpen) return null;

  return (
    <div className="sigma-settings-overlay">
      <div className="sigma-settings-panel">
        <div className="sigma-settings-header">
          <h2>Settings</h2>
          <button className="sigma-settings-close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        <div className="sigma-settings-content scrollable">
          <div className="sigma-section">
            <h3>Setup</h3>

            {!isProduction && (
              <>
                <div className="sigma-form-group">
                  <label>App Data Directory</label>
                  <input type="text" value={appDataPath} disabled />
                </div>

                <div className="sigma-btn-row">
                  <button
                    className="sigma-btn-primary"
                    onClick={onDownloadLlama}
                    disabled={isDownloadingLlama}
                  >
                    {isDownloadingLlama ? "Downloading..." : "Download llama.cpp"}
                  </button>
                </div>

                {isDownloadingLlama && <ProgressBar downloadProgress={downloadProgress} />}
              </>
            )}

            <div className="sigma-form-group">
              <label>Base Model</label>
              <input type="text" value={baseModel} placeholder="model" disabled />
              <span className="sigma-help-text">Auto-selected based on system RAM</span>
            </div>

            <div className="sigma-form-group">
              <label className="sigma-checkbox-row">
                <input
                  type="checkbox"
                  checked={isUncensored}
                  onChange={(e) => onUncensoredChange(e.target.checked)}
                  disabled={isDownloadingModel}
                />
                <span className="sigma-checkbox-label">Uncensored Model</span>
              </label>
              <span className="sigma-warning-text">
                Uncensored model may produce unfiltered content. Use with caution.
              </span>
              <span className="sigma-help-text">
                Will download and activate uncensored version if not already available
              </span>
            </div>

            <div className="sigma-btn-row">
              <button
                className="sigma-btn-primary"
                onClick={onDownloadModel}
                disabled={isDownloadingModel || !baseModel}
              >
                {isDownloadingModel ? "Downloading..." : "Download Current Model"}
              </button>
            </div>

            {isDownloadingModel && <ProgressBar downloadProgress={downloadProgress} />}
          </div>

          <div className="sigma-section">
            <h3>Server Configuration</h3>

            <div className="sigma-form-group">
              <label>Context Size</label>
              <input
                type="number"
                value={ctxSizeValue}
                onChange={(e) => {
                  setCtxSizeValue(e.target.value);
                  const parsed = parseInt(e.target.value);
                  if (!isNaN(parsed)) {
                    onCtxSizeChange(parsed);
                  }
                }}
                onBlur={() => {
                  const value = parseInt(ctxSizeValue);
                  if (isNaN(value) || value < 6000) {
                    onCtxSizeChange(30000);
                    setCtxSizeValue("30000");
                  } else if (value > 100000) {
                    onCtxSizeChange(100000);
                    setCtxSizeValue("100000");
                  }
                }}
                min="6000"
                max="100000"
                step="1000"
              />
              <span className="sigma-help-text">Range: 6,000 – 100,000 tokens</span>
            </div>

            <div className="sigma-form-group">
              <label>GPU Layers</label>
              <input
                type="number"
                value={gpuLayersValue}
                onChange={(e) => {
                  setGpuLayersValue(e.target.value);
                  const parsed = parseInt(e.target.value);
                  if (!isNaN(parsed)) {
                    onGpuLayersChange(parsed);
                  }
                }}
                onBlur={() => {
                  const value = parseInt(gpuLayersValue);
                  if (isNaN(value) || value < 0) {
                    onGpuLayersChange(0);
                    setGpuLayersValue("0");
                  } else if (value > 41) {
                    onGpuLayersChange(41);
                    setGpuLayersValue("41");
                  }
                }}
                min="0"
                max="41"
              />
              <span className="sigma-help-text">Range: 0 – 41 layers (0 = CPU only)</span>
            </div>

            <div className="sigma-btn-row">
              <button className="sigma-btn-secondary" onClick={onRestoreDefaults}>
                Restore Defaults
              </button>
            </div>
          </div>

          <div className="sigma-section sigma-section-danger">
            <h3>Maintenance</h3>
            <span className="sigma-warning-text">Clear downloaded files to free up space</span>

            <div className="sigma-btn-row">
              <button className="sigma-btn-danger" onClick={() => setShowClearConfirm(true)}>
                Clear All Data
              </button>
            </div>
          </div>
        </div>

        {showClearConfirm && (
          <div className="sigma-confirm-overlay" onClick={() => setShowClearConfirm(false)}>
            <div className="sigma-confirm-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Confirm Clear All Data</h3>
              <p>
                Are you sure you want to clear all downloaded data? This action cannot be undone.
              </p>
              <div className="sigma-confirm-buttons">
                <button className="sigma-btn-secondary" onClick={() => setShowClearConfirm(false)}>
                  Cancel
                </button>
                <button
                  className="sigma-btn-danger"
                  onClick={() => {
                    onClearAllData();
                    setShowClearConfirm(false);
                  }}
                >
                  Clear All Data
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
