import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname),
  envDir: path.resolve(__dirname, ".."), // reads .env from apps/electron-desktop/
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
    // Expose POSTHOG_API_KEY to the renderer without requiring a VITE_ prefix.
    "import.meta.env.VITE_POSTHOG_API_KEY": JSON.stringify(process.env.POSTHOG_API_KEY ?? ""),
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
});
