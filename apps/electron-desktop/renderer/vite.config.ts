import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const envDir = path.resolve(__dirname, "..");

export default defineConfig(({ mode }) => {
  // loadEnv reads .env files from envDir into a plain object (not process.env).
  // We use "" prefix to load all variables, not just VITE_-prefixed ones.
  const env = loadEnv(mode, envDir, "");
  // Prefer the real process env (set in CI) over the .env file value.
  const posthogApiKey = process.env.POSTHOG_API_KEY ?? env.POSTHOG_API_KEY ?? "";

  return {
    root: path.resolve(__dirname),
    envDir,
    plugins: [react()],
    base: "./",
    css: {
      modules: {
        localsConvention: "camelCase",
      },
    },
    resolve: {
      alias: {
        "@assets": path.resolve(__dirname, "../assets"),
        "@main": path.resolve(__dirname, "../src/main"),
        "@store": path.resolve(__dirname, "src/store"),
        "@ipc": path.resolve(__dirname, "src/ipc"),
        "@gateway": path.resolve(__dirname, "src/gateway"),
        "@shared": path.resolve(__dirname, "src/ui/shared"),
        "@styles": path.resolve(__dirname, "src/ui/styles"),
        "@ui": path.resolve(__dirname, "src/ui"),
        "@analytics": path.resolve(__dirname, "src/analytics"),
      },
    },
    define: {
      // Expose POSTHOG_API_KEY (no VITE_ prefix in .env) to the renderer at build time.
      "import.meta.env.VITE_POSTHOG_API_KEY": JSON.stringify(posthogApiKey),
    },
    build: {
      outDir: path.resolve(__dirname, "dist"),
      emptyOutDir: true,
    },
  };
});
