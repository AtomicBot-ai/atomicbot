import s from "./Toggle.module.css";

export function Toggle(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  "aria-label": string;
  disabled?: boolean;
}) {
  return (
    <label className={s.root} aria-label={props["aria-label"]}>
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span className={s.track}>
        <span className={s.thumb} />
      </span>
    </label>
  );
}
