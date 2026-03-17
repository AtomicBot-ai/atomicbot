import React, { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { upgradePaywallActions } from "@store/slices/upgradePaywallSlice";
import { CloseIcon } from "@shared/kit/icons";
import { UpgradePaywallContent } from "@ui/app/UpgradePaywallContent";
import s from "./UpgradePaywallPopup.module.css";

export function UpgradePaywallPopup() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector((state) => state.upgradePaywall.isOpen);

  const close = useCallback(() => {
    dispatch(upgradePaywallActions.close());
  }, [dispatch]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  if (!isOpen) return null;

  const content = (
    <div
      className={s.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-paywall-title"
      data-visible={isOpen}
    >
      <div className={s.scroll}>
        <header className={s.header}>
          <button type="button" className={s.closeBtn} aria-label="Close" onClick={close}>
            <CloseIcon size={16} />
          </button>
        </header>

        <div className={s.wrapper}>
          <h1 id="upgrade-paywall-title" className={s.title}>
            <span className={s.titleAccent}>UPGRADE</span>
            <span className={s.titlePlain}> TO UNLOCK ALL FEATURES</span>
          </h1>

          <UpgradePaywallContent />
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
