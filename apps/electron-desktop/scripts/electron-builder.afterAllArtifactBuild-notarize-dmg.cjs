/* eslint-disable no-console */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
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

function findFirstAppBundle(dir) {
  for (const entry of listDirSafe(dir)) {
    if (entry.isDirectory() && entry.name.endsWith(".app")) {
      return path.join(dir, entry.name);
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
  return Boolean(key && keyId && issuer);
}

function repoRootFromHere() {
  // apps/electron-desktop/scripts -> repo root
  return path.resolve(__dirname, "..", "..", "..");
}

function appRootFromHere() {
  // apps/electron-desktop/scripts -> apps/electron-desktop
  return path.resolve(__dirname, "..");
}

function readElectronDesktopPackageJson() {
  const appRoot = appRootFromHere();
  const pkgPath = path.join(appRoot, "package.json");
  const raw = fs.readFileSync(pkgPath, "utf-8");
  // Note: this is the app's own package.json, not the repo root.
  return JSON.parse(raw);
}

/**
 * electron-builder hook.
 *
 * Goal:
 * - Build a DMG from the signed .app (using macOS built-ins) with enough margin to avoid
 *   "No space left on device" errors from dmgbuild sizing heuristics.
 * - Optionally notarize + staple the DMG (recommended for Gatekeeper).
 *
 * This runs only when NOTARIZE=1 is set (to avoid local builds accidentally hitting Apple).
 *
 * Docs:
 * - https://www.electron.build/configuration/configuration#afterallartifactbuild
 * - scripts/notarize-mac-artifact.sh (repo root)
 */
module.exports = async function afterAllArtifactBuild(context) {
  // `afterAllArtifactBuild` context does not consistently expose `electronPlatformName`
  // (unlike `afterSign`/`afterPack`). Gate on the current runtime + artifact extension.
  if (process.platform !== "darwin") {
    return;
  }

  const outDir =
    context.outDir && typeof context.outDir === "string" ? context.outDir : process.cwd();
  const appOutDirGuess = path.join(outDir, `mac-${process.arch}`);
  const appOutDir =
    (context.appOutDir && typeof context.appOutDir === "string" ? context.appOutDir : null) ||
    appOutDirGuess;
  const appBundle = findFirstAppBundle(appOutDir);
  if (!appBundle) {
    throw new Error(
      `[electron-desktop] afterAllArtifactBuild: app bundle not found in: ${appOutDir}`
    );
  }

  // Prefer the app's own package.json for stable artifact naming.
  // We've observed electron-builder context sometimes reporting version as "0.0.0".
  const pkg = readElectronDesktopPackageJson();
  const productName =
    (pkg &&
      pkg.build &&
      typeof pkg.build.productName === "string" &&
      pkg.build.productName.trim()) ||
    "Atomic Bot";
  const version = (pkg && typeof pkg.version === "string" && pkg.version.trim()) || "0.0.0";

  const dmgPath = path.join(outDir, `${productName}-${version}-${process.arch}.dmg`);
  const rebuildScript = path.resolve(__dirname, "build-dmg-from-app.sh");
  if (!fs.existsSync(rebuildScript)) {
    throw new Error(
      `[electron-desktop] afterAllArtifactBuild: DMG build script missing: ${rebuildScript}`
    );
  }

  console.log(
    `[electron-desktop] afterAllArtifactBuild: building DMG from app: ${path.basename(appBundle)}`
  );
  run("bash", [rebuildScript, appBundle, dmgPath], {
    stdio: "inherit",
    env: {
      ...process.env,
      // Keep volume name consistent with prior electron-builder DMGs.
      DMG_VOLUME_NAME: `${productName} ${version}-${process.arch}`,
      // Extra headroom for filesystem overhead and symlink.
      DMG_MARGIN_MB: String(process.env.DMG_MARGIN_MB || "300"),
    },
  });

  // Sign the DMG container itself (Gatekeeper evaluates the disk image as a standalone artifact).
  // electron-builder signs the .app; our custom DMG rebuild step must sign the resulting .dmg explicitly.
  const cscName = process.env.CSC_NAME && String(process.env.CSC_NAME).trim();
  if (cscName) {
    console.log(`[electron-desktop] afterAllArtifactBuild: signing DMG with CSC_NAME: ${cscName}`);
    run("codesign", ["--force", "--sign", cscName, "--timestamp", dmgPath], {
      stdio: "inherit",
      env: process.env,
    });
    run("codesign", ["--verify", "--verbose=4", dmgPath], { stdio: "inherit", env: process.env });
  } else {
    console.log(
      "[electron-desktop] afterAllArtifactBuild: CSC_NAME not set (skipping DMG signing)"
    );
  }

  // Keep blockmap files — electron-updater uses them for efficient differential updates.

  const notarizeEnabled = String(process.env.NOTARIZE || "").trim() === "1";
  if (!notarizeEnabled) {
    console.log(
      "[electron-desktop] afterAllArtifactBuild: NOTARIZE=1 not set (skipping DMG notarization)"
    );
    return;
  }

  if (!hasNotaryAuthEnv()) {
    throw new Error(
      [
        "[electron-desktop] afterAllArtifactBuild: notary auth missing.",
        "Set NOTARYTOOL_PROFILE (keychain profile) OR NOTARYTOOL_KEY/NOTARYTOOL_KEY_ID/NOTARYTOOL_ISSUER (API key).",
      ].join("\n")
    );
  }

  const repoRoot = repoRootFromHere();
  const notarizeScript = path.join(repoRoot, "scripts", "notarize-mac-artifact.sh");
  if (!fs.existsSync(notarizeScript)) {
    throw new Error(
      `[electron-desktop] afterAllArtifactBuild: notarize script not found: ${notarizeScript}`
    );
  }

  console.log(`[electron-desktop] afterAllArtifactBuild: notarizing DMG: ${dmgPath}`);
  run("bash", [notarizeScript, dmgPath], { stdio: "inherit", env: process.env });
};
