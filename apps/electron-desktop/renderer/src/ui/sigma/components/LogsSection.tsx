import "./LogsSection.css";

interface LogsSectionProps {
  logs: string[];
}

export const LogsSection = ({ logs }: LogsSectionProps) => {
  return (
    <div className="sigma-logs">
      {logs.map((log, index) => (
        <div key={index} className="sigma-log-entry">
          {log}
        </div>
      ))}
      {logs.length === 0 && (
        <div className="sigma-log-entry sigma-log-entry--empty">No logs yet...</div>
      )}
    </div>
  );
};
