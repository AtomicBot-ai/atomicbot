export const routes = {
  consent: "/consent",
  loading: "/loading",
  error: "/error",
  welcome: "/welcome",
  legacy: "/legacy",
  chat: "/chat",
  settings: "/settings",
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

