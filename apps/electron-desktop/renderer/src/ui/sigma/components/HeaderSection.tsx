import { useAppIconUrl } from "../../shared/kit/Brand";
import "./HeaderSection.css";

interface HeaderSectionProps {
  onToggleSettings: () => void;
}

export const HeaderSection = ({ onToggleSettings }: HeaderSectionProps) => {
  const iconUrl = useAppIconUrl();

  return (
    <div className="sigma-header">
      <div className="sigma-header-brand">
        <img
          className="sigma-header-logo"
          src={iconUrl}
          alt="Sigma Eclipse"
          width={32}
          height={32}
        />
        <span className="sigma-header-title">Sigma Eclipse LLM</span>
      </div>
      <button className="sigma-header-settings" onClick={onToggleSettings} title="Settings">
        ⚙
      </button>
    </div>
  );
};
