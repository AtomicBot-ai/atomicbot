import { useState, useEffect } from "react";
import "./StartButton.css";

interface StartButtonProps {
  handleClick: () => void;
  isRunning: boolean;
  isBusy: boolean;
}

export const StartButton = ({ handleClick, isRunning, isBusy }: StartButtonProps) => {
  const [isActive, setIsActive] = useState(isRunning);

  useEffect(() => {
    setIsActive(isRunning);
  }, [isRunning]);

  const onClick = () => {
    if (isBusy) return;
    setIsActive((prev) => !prev);
    handleClick();
  };

  return (
    <div className={`start-button ${isActive ? "active" : ""}`} onClick={onClick}>
      <div className="background"></div>
      <div className="icon">
        <div className="part left"></div>
        <div className="part right"></div>
      </div>
      <div className="hit-area"></div>
    </div>
  );
};
