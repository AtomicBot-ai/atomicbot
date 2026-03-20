import { InfoIcon } from "./icons";
import s from "./InfoTooltip.module.css";

export function InfoTooltip({ text }: { text: string }) {
  return (
    <span className={s.wrap} title={text}>
      <span className={s.icon}>
        <InfoIcon />
      </span>
      <span className={s.tooltip} role="tooltip">
        {text}
      </span>
    </span>
  );
}
