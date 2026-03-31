import React from "react";
import { useAppSelector } from "@store/hooks";
import styles from "./WarmupBanner.module.css";

export function WarmupBanner() {
  const warmupStatus = useAppSelector((s) => s.llamacpp.warmupStatus);
  const authMode = useAppSelector((s) => s.auth.mode);
  const [showReady, setShowReady] = React.useState(false);
  const wasWarmingRef = React.useRef(false);

  React.useEffect(() => {
    if (warmupStatus === "warming") {
      wasWarmingRef.current = true;
    }
    if (warmupStatus === "ready" && wasWarmingRef.current) {
      setShowReady(true);
      const timer = setTimeout(() => setShowReady(false), 3000);
      return () => clearTimeout(timer);
    }
    if (warmupStatus !== "ready") {
      setShowReady(false);
    }
  }, [warmupStatus]);

  if (authMode !== "local-model") return null;

  if (warmupStatus === "warming") {
    return (
      <div className={styles.Banner} role="status" aria-live="polite">
        <div className={styles.IconBox}>
          <span className={styles.Spinner} />
        </div>
        <div className={styles.Body}>
          <span className={styles.Text}>
            Warming up model cache&hellip; It may take few minutes
          </span>
        </div>
      </div>
    );
  }

  if (showReady) {
    return (
      <div className={`${styles.Banner} ${styles.BannerReady}`} role="status" aria-live="polite">
        <div className={styles.IconBox}>
          <CheckIcon />
        </div>
        <div className={styles.Body}>
          <span className={`${styles.Text} ${styles.ReadyText}`}>Model cache ready</span>
        </div>
      </div>
    );
  }

  return null;
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3.5 8.5L6.5 11.5L12.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
