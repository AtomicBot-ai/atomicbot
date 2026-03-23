/* eslint-disable no-console */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf-8", ...opts });
  if (res.status !== 0) {
    const stderr = String(res.stderr || "").trim();
    const stdout = String(res.stdout || "").trim();
    throw new Error(`${cmd} ${args.join(" ")} failed: ${stderr || stdout || `exit ${res.status}`}`);
  }
  return String(res.stdout || "");
}

function listDirSafe(p) {
  try {
    return fs.readdirSync(p, { withFileTypes: true });
  } catch {
    return [];
  }
}

function findFirstAppBundle(appOutDir) {
  for (const entry of listDirSafe(appOutDir)) {
    if (entry.isDirectory() && entry.name.endsWith(".app")) {
      return path.join(appOutDir, entry.name);
    }
  }
  return null;
}

function hasNotaryAuthEnv() {
  if (process.env.NOTARYTOOL_PROFILE && String(process.env.NOTARYTOOL_PROFILE).trim()) {
    return true;
  }
  const key = process.env.NOTARYTOOL_KEY && String(process.env.NOTARYTOOL_KEY).trim();
  const keyId = process.env.NOTARYTOOL_KEY_ID && String(process.env.NOTARYTOOL_KEY_ID).trim();
  const issuer = process.env.NOTARYTOOL_ISSUER && String(process.env.NOTARYTOOL_ISSUER).trim();
  if (key && keyId && issuer) return true;
  const appleId = process.env.APPLE_ID && String(process.env.APPLE_ID).trim();
  const applePassword = process.env.APPLE_PASSWORD && String(process.env.APPLE_PASSWORD).trim();
  const appleTeamId = process.env.APPLE_TEAM_ID && String(process.env.APPLE_TEAM_ID).trim();
  return Boolean(appleId && applePassword && appleTeamId);
}

function repoRootFromHere() {
  // apps/electron-desktop/scripts -> repo root
  return path.resolve(__dirname, "..", "..", "..");
}

/**
 * electron-builder hook.
 *
 * Notarization strategy:
 * - Create a temporary zip of the signed .app (ditto keeps resource forks)
 * - Submit via the repo's notarytool wrapper (supports keychain profile or API key)
 * - Staple ticket into the .app (STAPLE_APP_PATH)
 *
 * This runs only when NOTARIZE=1 is set (to avoid local builds accidentally hitting Apple).
 */
module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const notarizeEnabled = String(process.env.NOTARIZE || "").trim() === "1";
  if (!notarizeEnabled) {
    console.log("[electron-desktop] afterSign: NOTARIZE=1 not set (skipping notarization)");
    return;
  }

  if (!hasNotaryAuthEnv()) {
    throw new Error(
      [
        "[electron-desktop] afterSign: notary auth missing.",
        "Set NOTARYTOOL_PROFILE, NOTARYTOOL_KEY/KEY_ID/ISSUER, or APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID.",
      ].join("\n")
    );
  }

  const appOutDir = context.appOutDir;
  const appBundle = findFirstAppBundle(appOutDir);
  if (!appBundle) {
    throw new Error(`[electron-desktop] afterSign: failed to locate .app bundle in: ${appOutDir}`);
  }

  const repoRoot = repoRootFromHere();
  const notarizeScript = path.join(repoRoot, "scripts", "notarize-mac-artifact.sh");
  if (!fs.existsSync(notarizeScript)) {
    throw new Error(`[electron-desktop] afterSign: notarize script not found: ${notarizeScript}`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sigmabrowser-notary-"));
  const appName = path.basename(appBundle, ".app");
  const zipPath = path.join(tmpDir, `${appName}.notary.zip`);

  try {
    console.log(`[electron-desktop] afterSign: creating notary zip: ${zipPath}`);
    // ditto is the canonical way to zip a .app for notarization (preserves resource forks)
    run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", appBundle, zipPath], {
      stdio: "inherit",
    });

    console.log("[electron-desktop] afterSign: submitting to notary service (xcrun notarytool) …");
    run(
      "bash",
      [
        "-lc",
        `STAPLE_APP_PATH="${appBundle.replace(/"/g, '\\"')}" "${notarizeScript.replace(/"/g, '\\"')}" "${zipPath.replace(/"/g, '\\"')}"`,
      ],
      { stdio: "inherit", env: process.env }
    );
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
};
