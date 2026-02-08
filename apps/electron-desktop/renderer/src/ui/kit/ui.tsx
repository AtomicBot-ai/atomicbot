import React from "react";

export function Brand({
  text = "ATOMIC BOT",
  iconSrc,
  iconAlt = "",
}: {
  text?: string;
  iconSrc?: string;
  iconAlt?: string;
}) {
  return (
    <div className="UiBrand" aria-label={text}>
      {iconSrc ? (
        <img
          className="UiBrandIcon"
          src={iconSrc}
          alt={iconAlt}
          aria-hidden={iconAlt ? undefined : true}
        />
      ) : (
        <span className="UiBrandMark" aria-hidden="true">
          +
        </span>
      )}
      <span className="UiBrandText">{text}</span>
    </div>
  );
}

// Resolve app icon relative to renderer's index.html (renderer/dist/index.html -> ../../assets/)
function useAppIconUrl(): string {
  return React.useMemo(() => {
    return new URL("../../assets/icon-simple-splash.png", document.baseURI).toString();
  }, []);
}

export function SplashLogo({ iconAlt = "", size = 64 }: { iconAlt?: string; size?: number }) {
  const iconUrl = useAppIconUrl();
  return (
    <img
      className="UiSplashLogo"
      src={iconUrl}
      alt={iconAlt}
      aria-hidden={iconAlt ? undefined : true}
      width={size}
      height={size}
    />
  );
}

export function SpinningSplashLogo({
  iconAlt = "",
  className,
}: {
  iconAlt?: string;
  className?: string;
}) {
  const merged = className
    ? `UiSplashLogo UiSplashLogo--spin ${className}`
    : "UiSplashLogo UiSplashLogo--spin";
  const iconUrl = useAppIconUrl();
  return (
    <img
      className={merged}
      width={64}
      height={64}
      src={iconUrl}
      alt={iconAlt}
      aria-hidden={iconAlt ? undefined : true}
    />
  );
}

export function FullscreenShell(props: {
  children: React.ReactNode;
  role?: "dialog" | "main" | "status";
  "aria-label"?: string;
  showTopbar?: boolean;
}) {
  const showTopbar = props.showTopbar ?? false;
  const brandIconUrl = useAppIconUrl();
  return (
    <div className="UiHeroShell" role={props.role} aria-label={props["aria-label"]}>
      {showTopbar ? (
        <div className="UiHeroTopbar">
          <Brand iconSrc={brandIconUrl} />
        </div>
      ) : null}
      {props.children}
    </div>
  );
}

export function HeroPageLayout(props: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  role?: "dialog" | "main";
  "aria-label"?: string;
  align?: "start" | "center";
  variant?: "default" | "compact";
  hideTopbar?: boolean;
}) {
  const { title, subtitle, children, role = "main" } = props;
  const align = props.align ?? "start";
  const variant = props.variant ?? "default";
  const hideTopbar = props.hideTopbar ?? false;
  const brandIconUrl = useAppIconUrl();
  const heroClassName = `UiHero UiHero-align-${align}${variant === "compact" ? " UiHero-compact" : ""}`;
  return (
    <div className="UiHeroShell" role={role} aria-label={props["aria-label"]}>
      {!hideTopbar && (
        <div className="UiHeroTopbar">
          <Brand iconSrc={brandIconUrl} />
        </div>
      )}

      <div className={heroClassName}>
        {title ? <div className="UiHeroTitle">{title}</div> : null}
        {subtitle ? <div className="UiHeroSubtitle">{subtitle}</div> : null}
        {children}
      </div>
    </div>
  );
}

export function GlassCard({
  children,
  size = "default",
  className,
}: {
  children: React.ReactNode;
  size?: "default" | "wide";
  className?: string;
}) {
  const base = size === "wide" ? "UiGlassCard UiGlassCard-wide" : "UiGlassCard";
  const merged = className ? `${base} ${className}` : base;
  return <div className={merged}>{children}</div>;
}

export function ScrollBox({ children }: { children: React.ReactNode }) {
  return <div className="UiScrollBox">{children}</div>;
}

export function TextInput(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "password";
  disabled?: boolean;
  autoCapitalize?: string;
  isError?: string;
  autoCorrect?: string;
  spellCheck?: boolean;
  className?: string;
  error?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  label?: string;
}) {
  const className = `UiInput${props.error ? " UiInput--error" : ""}${props.className ? ` ${props.className}` : ""}`;
  return (
    <div>
      {props.label && <label className={"UiInputLabel"}>{props.label}</label>}
      <div className={`UiInputWrap ${props.isError && "UiInputWrapError"}`}>
        <input
          ref={props.inputRef}
          className={className}
          type={props.type ?? "text"}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          disabled={props.disabled}
          autoCapitalize={props.autoCapitalize}
          autoCorrect={props.autoCorrect}
          spellCheck={props.spellCheck}
          aria-invalid={props.error ? true : undefined}
        />
      </div>
      {props.isError && <div className="InputErrorMessage">{props.isError}</div>}
    </div>
  );
}

export function CheckboxRow(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  className?: string;
  error?: boolean;
  disabled?: boolean;
}) {
  const className = `UiCheckRow${props.error ? " UiCheckRow--error" : ""}${props.className ? ` ${props.className}` : ""}`;
  return (
    <label className={className}>
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span>{props.children}</span>
    </label>
  );
}

export function InlineError({ children }: { children: React.ReactNode }) {
  return <div className="UiInlineError">{children}</div>;
}

export function FooterText({ children }: { children: React.ReactNode }) {
  return <div className="UiFooterText">{children}</div>;
}

export function PrimaryButton(props: {
  children: React.ReactNode;
  size?: "sm";
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`UiPrimaryButton ${props.size === "sm" && "UiPrimaryButtonSm"}`}
      disabled={props.disabled || props.loading}
      onClick={props.onClick}
    >
      {props.loading ? <span className="UiButtonSpinner" aria-hidden="true" /> : null}
      {props.children}
    </button>
  );
}

export function SecondaryButton(props: {
  children: React.ReactNode;
  disabled?: boolean;
  size?: "sm";
  onClick: () => void;
}) {
  return (
    <button
      className={`UiSecondaryButton ${props.size === "sm" && "UiSecondaryButtonSm"}`}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

export function ButtonRow({ children }: { children: React.ReactNode }) {
  return <div className="UiButtonRow">{children}</div>;
}

export function ActionButton(props: {
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  variant?: "secondary" | "primary";
  onClick: () => void;
  className?: string;
}) {
  const variant = props.variant ?? "secondary";
  const className =
    variant === "primary" ? "UiActionButton UiActionButton-primary" : "UiActionButton";
  return (
    <button className={className} disabled={props.disabled || props.loading} onClick={props.onClick}>
      {props.loading ? <span className="UiButtonSpinner" aria-hidden="true" /> : null}
      {props.children}
    </button>
  );
}

/** Lightweight modal overlay with a centered card. */
export function Modal(props: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  // Close on Escape key
  React.useEffect(() => {
    if (!props.open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  return (
    <div
      className="UiModalOverlay"
      role="dialog"
      aria-modal="true"
      aria-label={props["aria-label"]}
      onClick={(e) => {
        // Close when clicking the backdrop (not the card itself)
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div className="UiModalCard">
        <button className="UiModalClose" type="button" aria-label="Close" onClick={props.onClose}>
          &times;
        </button>
        {props.children}
      </div>
    </div>
  );
}
