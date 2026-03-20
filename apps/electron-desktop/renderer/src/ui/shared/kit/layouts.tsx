import React from "react";

import { Brand, useAppIconUrl } from "./Brand";

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
  color?: "primary" | "secondary";
  context?: "default" | "onboarding";
  hideTopbar?: boolean;
  className?: string;
}) {
  const { title, subtitle, children, role = "main", className } = props;
  const align = props.align ?? "start";
  const variant = props.variant ?? "default";
  const color = props.color ?? "primary";
  const hideTopbar = props.hideTopbar ?? false;
  const context = props.context ?? "default";
  const brandIconUrl = useAppIconUrl();
  const heroClassName = `UiHero UiHero-align-${align}${variant === "compact" ? " UiHero-compact" : ""}${context === "onboarding" ? " UiHero-onboarding" : ""}${color === "secondary" ? " UiHero-secondary-color" : ""} ${className}`;
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
