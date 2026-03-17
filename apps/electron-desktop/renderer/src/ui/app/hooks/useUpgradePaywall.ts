import { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { upgradePaywallActions } from "@store/slices/upgradePaywallSlice";

/** Hook to open/close the full-screen upgrade paywall from anywhere in the app. */
export function useUpgradePaywall() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector((state) => state.upgradePaywall.isOpen);
  const open = useCallback(() => {
    dispatch(upgradePaywallActions.open());
  }, [dispatch]);
  const close = useCallback(() => {
    dispatch(upgradePaywallActions.close());
  }, [dispatch]);
  return { isOpen, open, close };
}
