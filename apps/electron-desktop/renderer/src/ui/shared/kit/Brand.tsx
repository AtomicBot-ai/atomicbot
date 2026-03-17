import React from "react";

// Resolve app icon relative to renderer's index.html (renderer/dist/index.html -> ../../assets/)
export function useAppIconUrl(): string {
  return React.useMemo(() => {
    return new URL("../../assets/icon-simple-splash.png", document.baseURI).toString();
  }, []);
}

export function Brand({
  text = "SIGMA ECLIPSE",
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
