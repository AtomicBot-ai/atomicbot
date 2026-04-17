import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { "openclaw-launcher": "src/launcher.ts" },
  format: "esm",
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: false,
  dts: false,
  noExternal: [/.*/],
  tsconfig: "./tsconfig.json",
  shims: true,
  outputOptions: {
    entryFileNames: "[name].mjs",
    chunkFileNames: "[name]-[hash].mjs",
  },
});
