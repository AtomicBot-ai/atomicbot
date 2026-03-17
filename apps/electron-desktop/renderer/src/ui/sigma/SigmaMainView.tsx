import { useNavigate } from "react-router-dom";

import { useApp } from "../../hooks/sigma/useApp";
import { HeaderSection } from "./components/HeaderSection";
import { StatusPanel } from "./components/StatusPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { LogsSection } from "./components/LogsSection";
import { routes } from "../app/routes";
import "./SigmaMainView.css";

export function SigmaMainView() {
  const navigate = useNavigate();
  const {
    status,
    logs,
    isProduction,
    isSettingsOpen,
    setIsSettingsOpen,
    baseModel,
    isUncensored,
    ctxSize,
    gpuLayers,
    appDataPath,
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
  } = useApp();

  return (
    <main className="sigma-root">
      <HeaderSection onToggleSettings={() => setIsSettingsOpen(!isSettingsOpen)} />

      <SettingsPanel
        isOpen={isSettingsOpen}
        appDataPath={appDataPath}
        baseModel={baseModel}
        isUncensored={isUncensored}
        ctxSize={ctxSize}
        gpuLayers={gpuLayers}
        isDownloadingLlama={isDownloadingLlama}
        isDownloadingModel={isDownloadingModel}
        downloadProgress={downloadProgress}
        status={status}
        onClose={() => setIsSettingsOpen(false)}
        onDownloadLlama={handleDownloadLlama}
        onDownloadModel={handleDownloadModel}
        onUncensoredChange={handleUncensoredChange}
        onCtxSizeChange={handleCtxSizeChange}
        onGpuLayersChange={handleGpuLayersChange}
        onRestoreDefaults={handleRestoreDefaults}
        onClearAllData={handleClearAllData}
        isProduction={isProduction}
      />

      <div className="sigma-content">
        <StatusPanel
          status={status}
          onStartServer={handleStartServer}
          onStopServer={handleStopServer}
          isBusy={isBusy}
        />

        {!isProduction && <LogsSection logs={logs} />}
      </div>

      <div className="sigma-footer">
        <button className="sigma-back-button" onClick={() => navigate(routes.consent)}>
          ← Back
        </button>
      </div>
    </main>
  );
}
