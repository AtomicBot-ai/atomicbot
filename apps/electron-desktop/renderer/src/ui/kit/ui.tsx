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
        <img className="UiBrandIcon" src={iconSrc} alt={iconAlt} aria-hidden={iconAlt ? undefined : true} />
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

export function SplashLogo({ iconAlt = "" }: { iconAlt?: string }) {
  const iconUrl = useAppIconUrl();
  return <img className="UiSplashLogo" src={iconUrl} alt={iconAlt} aria-hidden={iconAlt ? undefined : true} />;
}

export function SpinningSplashLogo({
  iconAlt = "",
  className,
}: {
  iconAlt?: string;
  className?: string;
}) {
  const merged = className ? `UiSplashLogo UiSplashLogo--spin ${className}` : "UiSplashLogo UiSplashLogo--spin";
  const iconUrl = useAppIconUrl();
  return <img className={merged} src={iconUrl} alt={iconAlt} aria-hidden={iconAlt ? undefined : true} />;
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
  autoCorrect?: string;
  spellCheck?: boolean;
}) {
  return (
    <input
      className="UiInput"
      type={props.type ?? "text"}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      placeholder={props.placeholder}
      disabled={props.disabled}
      autoCapitalize={props.autoCapitalize}
      autoCorrect={props.autoCorrect}
      spellCheck={props.spellCheck}
    />
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
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button className="UiPrimaryButton" disabled={props.disabled} onClick={props.onClick}>
      {props.children}
    </button>
  );
}

export function SecondaryButton(props: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button className="UiSecondaryButton" disabled={props.disabled} onClick={props.onClick}>
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
  variant?: "secondary" | "primary";
  onClick: () => void;
}) {
  const variant = props.variant ?? "secondary";
  const className = variant === "primary" ? "UiActionButton UiActionButton-primary" : "UiActionButton";
  return (
    <button className={className} disabled={props.disabled} onClick={props.onClick}>
      {props.children}
    </button>
  );
}

export function ToolbarButton(props: {
  children: React.ReactNode;
  disabled?: boolean;
  variant?: "default" | "primary";
  onClick: () => void;
}) {
  const variant = props.variant ?? "default";
  const className = variant === "primary" ? "UiToolbarButton UiToolbarButton-primary" : "UiToolbarButton";
  return (
    <button className={className} disabled={props.disabled} onClick={props.onClick}>
      {props.children}
    </button>
  );
}

