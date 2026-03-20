import { useState, useEffect } from "react";
import styles from "./LoadingPhrase.module.css";

const DEFAULT_PHRASES = [
  "Thinking...",
  "Searching...",
  "Analyzing...",
  "Working on it...",
  "Almost there...",
];

export type LoadingPhraseProps = {
  phrases?: string[];
  intervalMs?: number;
  className?: string;
};

/** Rotating loading phrases with shimmer animation (replaces typing dots). */
export function LoadingPhrase(props: LoadingPhraseProps) {
  const { phrases = DEFAULT_PHRASES, intervalMs = 2500, className = "" } = props;

  const [currentIndex, setCurrentIndex] = useState(0);
  const currentPhrase = phrases[currentIndex] ?? "";

  useEffect(() => {
    if (phrases.length <= 1) return;
    const timerId = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % phrases.length);
    }, intervalMs);
    return () => clearInterval(timerId);
  }, [phrases.length, intervalMs]);

  return (
    <span className={`${styles.LoadingPhrase} ${className}`.trim()} aria-label="typing">
      {currentPhrase}
    </span>
  );
}
