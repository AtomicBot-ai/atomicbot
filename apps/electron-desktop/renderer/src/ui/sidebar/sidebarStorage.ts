const SIDEBAR_OPEN_LS_KEY = "atomicbot:sidebar-open";
/** @deprecated migrated on read */
const SIDEBAR_COLLAPSED_LEGACY_KEY = "atomicbot:sidebar-collapsed";

export function readSidebarOpenFromStorage(): boolean {
  try {
    const v = localStorage.getItem(SIDEBAR_OPEN_LS_KEY);
    if (v === "1") {
      return true;
    }
    if (v === "0") {
      return false;
    }
    const collapsed = localStorage.getItem(SIDEBAR_COLLAPSED_LEGACY_KEY) === "1";
    return !collapsed;
  } catch {
    return true;
  }
}

export function writeSidebarOpenToStorage(open: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_OPEN_LS_KEY, open ? "1" : "0");
    localStorage.removeItem(SIDEBAR_COLLAPSED_LEGACY_KEY);
  } catch {
    // ignore
  }
}
