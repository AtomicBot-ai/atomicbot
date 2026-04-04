import React from "react";

const TERMINAL_SIDEBAR_KEY = "terminal-sidebar-visible";
const TERMINAL_SIDEBAR_EVENT = "terminal-sidebar-changed";

/**
 * Shared hook for terminal sidebar visibility.
 * OtherTab uses the setter; Sidebar reads the boolean.
 * Cross-component sync via localStorage + custom window event.
 */
export function useTerminalSidebarVisible(): [boolean, (v: boolean) => void] {
  const [visible, setVisible] = React.useState(() => {
    try {
      return localStorage.getItem(TERMINAL_SIDEBAR_KEY) !== "0";
    } catch {
      return true;
    }
  });

  React.useEffect(() => {
    const handler = () => {
      try {
        setVisible(localStorage.getItem(TERMINAL_SIDEBAR_KEY) !== "0");
      } catch {
        // ignore
      }
    };
    window.addEventListener(TERMINAL_SIDEBAR_EVENT, handler);
    return () => window.removeEventListener(TERMINAL_SIDEBAR_EVENT, handler);
  }, []);

  const toggle = React.useCallback((v: boolean) => {
    setVisible(v);
    try {
      localStorage.setItem(TERMINAL_SIDEBAR_KEY, v ? "1" : "0");
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event(TERMINAL_SIDEBAR_EVENT));
  }, []);

  return [visible, toggle];
}
