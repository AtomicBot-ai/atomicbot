import type { OpenclawDesktopApi } from "../../src/shared/desktop-bridge-contract";

declare global {
  interface Window {
    openclawDesktop?: OpenclawDesktopApi;
  }
}

interface ImportMetaEnv {
  readonly VITE_POSTHOG_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
