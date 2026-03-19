import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: __dirname,
    include: ["src/**/*.test.ts", "renderer/**/*.test.ts", "renderer/**/*.test.tsx"],
    exclude: ["node_modules/**", "dist/**", "renderer/dist/**"],
    setupFiles: ["./test/setup.ts"],
    environment: "node",
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@assets": path.resolve(__dirname, "assets"),
      "@main": path.resolve(__dirname, "src/main"),
      "@store": path.resolve(__dirname, "renderer/src/store"),
      "@ipc": path.resolve(__dirname, "renderer/src/ipc"),
      "@gateway": path.resolve(__dirname, "renderer/src/gateway"),
      "@shared": path.resolve(__dirname, "renderer/src/ui/shared"),
      "@styles": path.resolve(__dirname, "renderer/src/ui/styles"),
      "@ui": path.resolve(__dirname, "renderer/src/ui"),
      "@analytics": path.resolve(__dirname, "renderer/src/analytics"),
    },
  },
});
