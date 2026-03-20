#!/usr/bin/env node
/**
 * Inlines build-time environment variables into the compiled main-process JS.
 * Must run after `tsc` so that dist/main.js exists.
 *
 * Uses esbuild --define (no bundling) to replace process.env.* literals.
 * Also reads from a local .env file when env vars are not already set in the
 * shell — this covers both local dev builds and CI environments alike.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Load .env if present, but don't override vars already set in the environment.
const envFile = join(root, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

// Map of process.env.* keys to inline into dist/main.js.
const defines = {
  "process.env.POSTHOG_API_KEY": process.env.POSTHOG_API_KEY ?? "",
};

const defineArgs = Object.entries(defines).map(
  ([key, val]) => `--define:${key}=${JSON.stringify(val)}`
);

// esbuild with --define but WITHOUT --bundle: only replaces literals in-place.
// tsc outputs modules individually under dist/main/, so we target each file that
// contains build-time env var references rather than the single entry dist/main.js.
const esbuildBin = join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "esbuild.cmd" : "esbuild"
);

const targets = ["dist/main/analytics/posthog-main.js"];

for (const target of targets) {
  execFileSync(
    esbuildBin,
    [
      target,
      "--platform=node",
      "--format=cjs",
      `--outfile=${target}`,
      "--allow-overwrite",
      ...defineArgs,
    ],
    { stdio: "inherit", cwd: root }
  );
}

console.log("[define-main-env] main-process env vars inlined.");
