/**
 * Custom dropdown with rich option rendering (icons, badges, descriptions).
 * Used by AccountModelsTab for Provider and Model selection.
 *
 * @deprecated Part of the legacy AccountModels tab — scheduled for removal.
 */
import React from "react";
import { usePresenceTransition } from "@ui/settings/hooks/usePresenceTransition";
import s from "./RichSelect.module.css";

export type RichOption<T extends string = string> = {
  value: T;
  label: string;
  icon?: string;
  description?: string;
  meta?: string;
  badge?: { text: string; variant: string };
};

function ChevronDown(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function RichSelect<T extends string>(props: {
  value: T | null;
  onChange: (value: T) => void;
  options: RichOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  disabledStyles?: boolean;
  onlySelectedIcon?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const selected = React.useMemo(
    () => (props.value ? (props.options.find((o) => o.value === props.value) ?? null) : null),
    [props.value, props.options]
  );

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const handleSelect = (value: T) => {
    props.onChange(value);
    setOpen(false);
  };

  const filteredOptions = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return props.options;
    return props.options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.description?.toLowerCase().includes(q) ?? false) ||
        (o.meta?.toLowerCase().includes(q) ?? false)
    );
  }, [props.options, searchQuery]);

  React.useEffect(() => {
    if (!open) setSearchQuery("");
  }, [open]);

  const { shouldRender, isEntered, isExiting, onTransitionEnd } = usePresenceTransition(open);

  return (
    <div className={s.wrapper} ref={wrapperRef}>
      <button
        type="button"
        className={`glass-effect ${s.trigger} ${props.disabledStyles ? s.triggerDisabled : ""}`}
        onClick={() => !props.disabled && setOpen(!open)}
        disabled={props.disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected?.icon ? (
          <img className={s.triggerIcon} src={selected.icon} alt="" aria-hidden="true" />
        ) : null}
        <span className={`${s.triggerLabel} ${!selected ? s.triggerPlaceholder : ""}`}>
          {selected?.label ?? props.placeholder ?? "Select…"}
        </span>
        {selected?.badge ? (
          <span className={`${s.optionBadge} ${s[`optionBadge--${selected.badge.variant}`] ?? ""}`}>
            {selected.badge.text}
          </span>
        ) : null}

        <ChevronDown className={`${s.triggerChevron} ${open ? s["triggerChevron--open"] : ""}`} />
      </button>

      {shouldRender ? (
        <div
          className={`${s.dropdown} ${isExiting ? s.dropdownClosing : ""}`}
          onTransitionEnd={onTransitionEnd}
        >
          <div className={s.dropdownSearch}>
            <input
              type="search"
              className={s.searchInput}
              placeholder="Search…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label="Search options"
              autoFocus
            />
          </div>
          <div className={s.dropdownInner + " scrollable"} role="listbox">
            <div className={s.dropdownList}>
              {filteredOptions.length === 0 ? (
                <div className={s.dropdownEmpty} role="status">
                  {searchQuery.trim() ? "No options found" : "No options"}
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isActive = opt.value === props.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={`${s.option} ${isActive ? s["option--active"] : ""}`}
                      onClick={() => handleSelect(opt.value)}
                    >
                      {opt.icon && !props.onlySelectedIcon ? (
                        <img className={s.optionIcon} src={opt.icon} alt="" aria-hidden="true" />
                      ) : null}
                      <div className={s.optionContent}>
                        <div className={s.optionHeader}>
                          <span className={s.optionName}>{opt.label}</span>
                          {opt.badge ? (
                            <span
                              className={`${s.optionBadge} ${s[`optionBadge--${opt.badge.variant}`] ?? ""}`}
                            >
                              {opt.badge.text}
                            </span>
                          ) : null}
                        </div>
                        {opt.description ? (
                          <div className={s.optionDescription}>{opt.description}</div>
                        ) : null}
                        {opt.meta ? <div className={s.optionMeta}>{opt.meta}</div> : null}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
