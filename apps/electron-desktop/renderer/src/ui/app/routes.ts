export const routes = {
  consent: "/consent",
  loading: "/loading",
  error: "/error",
  welcome: "/welcome",
  legacy: "/legacy",
  chat: "/chat",
  settings: "/settings",
  terminal: "/terminal",
  // sigma: Local LLM main view
  sigma: "/sigma",
} as const;

export function isBootstrapPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === routes.consent ||
    pathname === routes.loading ||
    pathname === routes.error ||
    pathname === routes.welcome ||
    pathname.startsWith(`${routes.welcome}/`)
  );
}
