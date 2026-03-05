import * as React from "react";

type UsePresenceTransitionResult = {
  shouldRender: boolean;
  isEntered: boolean;
  isExiting: boolean;
  onTransitionEnd: (e: React.TransitionEvent<HTMLElement>) => void;
};

export function usePresenceTransition(open: boolean): UsePresenceTransitionResult {
  const [shouldRender, setShouldRender] = React.useState(open);
  const [isEntered, setIsEntered] = React.useState(false);
  const [isExiting, setIsExiting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setShouldRender(true);
      setIsExiting(false);

      const id = requestAnimationFrame(() => setIsEntered(true));
      return () => cancelAnimationFrame(id);
    } else if (shouldRender) {
      setIsEntered(false);
      setIsExiting(true);
    }
  }, [open, shouldRender]);

  const onTransitionEnd = React.useCallback(
    (e: React.TransitionEvent<HTMLElement>) => {
      if (e.currentTarget !== e.target) return;

      if (e.propertyName !== "opacity" && e.propertyName !== "transform") return;

      if (isExiting) {
        setShouldRender(false);
        setIsExiting(false);
      }
    },
    [isExiting]
  );

  return { shouldRender, isEntered, isExiting, onTransitionEnd };
}
