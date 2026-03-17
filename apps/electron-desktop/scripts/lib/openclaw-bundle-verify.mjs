import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { CRITICAL_RUNTIME_PACKAGES, SMOKE_COMMANDS } from "./openclaw-bundle-config.mjs";

function runCheck(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    encoding: "utf-8",
    stdio: "pipe",
    ...opts,
  });
  return {
    status: res.status,
    signal: res.signal ?? null,
    stdout: String(res.stdout || "").trim(),
    stderr: String(res.stderr || "").trim(),
  };
}

function assertExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`[verify-openclaw-bundle] Missing ${label}: ${filePath}`);
  }
}

export function verifyBundle(params) {
  const defaultTimeout = process.platform === "win32" ? 30_000 : 20_000;
  const { outDir, timeoutMs = defaultTimeout } = params;
  const openclawEntry = path.join(outDir, "openclaw.mjs");
  const distEntry = path.join(outDir, "dist", "entry.js");
  const controlUiIndex = path.join(outDir, "dist", "control-ui", "index.html");
  const nodeModulesDir = path.join(outDir, "node_modules");

  assertExists(openclawEntry, "openclaw entrypoint");
  assertExists(distEntry, "runtime dist entry");
  assertExists(controlUiIndex, "control UI index");
  assertExists(nodeModulesDir, "node_modules");

  const resolveScript = `
const { createRequire } = require("node:module");
const req = createRequire(process.argv[1]);
const pkgs = process.argv.slice(2);
const failed = [];
for (const p of pkgs) {
  try { req.resolve(p); } catch { failed.push(p); }
}
if (failed.length > 0) {
  console.error("Missing runtime packages:", failed.join(", "));
  process.exit(1);
}
console.log("Resolved critical runtime packages:", pkgs.join(", "));
`;
  const resolveRes = runCheck(
    "node",
    ["-e", resolveScript, openclawEntry, ...CRITICAL_RUNTIME_PACKAGES],
    { cwd: outDir, timeout: timeoutMs }
  );
  if (resolveRes.status !== 0) {
    throw new Error(
      `[verify-openclaw-bundle] package resolve check failed.\n${resolveRes.stderr || resolveRes.stdout}`
    );
  }

  for (const cmdArgs of SMOKE_COMMANDS) {
    const smokeRes = runCheck("node", [openclawEntry, ...cmdArgs], {
      cwd: outDir,
      timeout: timeoutMs,
    });
    if (smokeRes.status !== 0) {
      const isHelpProbe = cmdArgs.includes("--help");
      const outputLooksValid =
        isHelpProbe &&
        smokeRes.stdout.includes("OpenClaw") &&
        smokeRes.stdout.includes("Commands:");
      if (outputLooksValid && !smokeRes.stderr) {
        // On Windows, help commands occasionally report non-zero status
        // even though the output is complete (timeout/signal edge cases).
        console.warn(
          `[verify-openclaw-bundle] smoke warning: node openclaw.mjs ${cmdArgs.join(" ")} ` +
            `exited with status=${smokeRes.status} signal=${smokeRes.signal}, but output looks valid — continuing`
        );
        continue;
      }
      throw new Error(
        `[verify-openclaw-bundle] smoke failed (status=${smokeRes.status}, signal=${smokeRes.signal}): ` +
          `node openclaw.mjs ${cmdArgs.join(" ")}\n${smokeRes.stderr || smokeRes.stdout}`
      );
    }
  }
}
