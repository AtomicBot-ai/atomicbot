import React from "react";
import type { BannerItem } from "./types";
import { useDismissBanner } from "./BannerContext";
import s from "./BannerCarousel.module.css";
import { CloseIcon } from "@shared/kit/icons";

const SWIPE_THRESHOLD = 40;

export function BannerCarousel({ items }: { items: BannerItem[] }) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const touchStartRef = React.useRef<number | null>(null);
  const dismiss = useDismissBanner();

  React.useEffect(() => {
    setActiveIndex((prev) => Math.min(prev, Math.max(0, items.length - 1)));
  }, [items.length]);

  if (items.length === 0) {
    return null;
  }

  const current = items[activeIndex];
  if (!current) {
    return null;
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const startX = touchStartRef.current;
    if (startX == null) return;
    const endX = e.changedTouches[0]?.clientX ?? startX;
    const delta = endX - startX;
    touchStartRef.current = null;

    if (Math.abs(delta) < SWIPE_THRESHOLD) return;

    if (delta < 0 && activeIndex < items.length - 1) {
      setActiveIndex((i) => i + 1);
    } else if (delta > 0 && activeIndex > 0) {
      setActiveIndex((i) => i - 1);
    }
  };

  const iconVariantClass = s[`BannerIcon--${current.variant}` as keyof typeof s] ?? "";

  return (
    <div className={s.BannerCarousel}>
      <div
        className={s.BannerSlide}
        role="status"
        aria-live="polite"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {current.icon && (
          <div className={`${s.BannerIcon} ${iconVariantClass}`}>{current.icon}</div>
        )}

        <div className={s.BannerBody}>
          <div className={s.BannerTitle}>{current.title}</div>
          {current.subtitle && <div className={s.BannerSubtitle}>{current.subtitle}</div>}
        </div>

        {current.action && (
          <button className={s.BannerAction} onClick={current.action.onClick} type="button">
            {current.action.label}
          </button>
        )}

        {current.dismissible && (
          <button
            className={s.BannerDismiss}
            onClick={() => {
              current.onDismiss?.();
              dismiss(current.id, current.dismissible!);
            }}
            type="button"
            aria-label="Dismiss banner"
          >
            <CloseIcon size={10} />
          </button>
        )}
      </div>

      {items.length > 1 && (
        <div className={s.BannerDots}>
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={`${s.BannerDot} ${i === activeIndex ? s["BannerDot--active"] : ""}`}
              onClick={() => setActiveIndex(i)}
              aria-label={`Banner ${i + 1} of ${items.length}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
