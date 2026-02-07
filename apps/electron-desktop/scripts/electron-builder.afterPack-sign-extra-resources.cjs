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

function findFirstAppBundle(appOutDir) {
  for (const entry of listDirSafe(appOutDir)) {
    if (entry.isDirectory() && entry.name.endsWith(".app")) {
      return path.join(appOutDir, entry.name);
    }
  }
  return null;
}

function selectSigningIdentity() {
  const explicit =
    (process.env.CSC_NAME && String(process.env.CSC_NAME).trim()) ||
    (process.env.SIGN_IDENTITY && String(process.env.SIGN_IDENTITY).trim()) ||
    (process.env.CODESIGN_IDENTITY && String(process.env.CODESIGN_IDENTITY).trim());
  if (explicit) {
    return explicit;
  }

  const out = run("security", ["find-identity", "-p", "codesigning", "-v"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lines = out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const pickFirst = (re) => {
    for (const line of lines) {
      const m = line.match(re);
      if (m && m[1]) {
        return m[1];
      }
    }
    return null;
  };

  // Prefer Developer ID Application, then Distribution, then Development.
  return (
    pickFirst(/"([^"]*Developer ID Application[^"]*)"/) ||
    pickFirst(/"([^"]*Apple Distribution[^"]*)"/) ||
    pickFirst(/"([^"]*Apple Development[^"]*)"/) ||
    pickFirst(/"([^"]+)"/)
  );
}

function shouldTimestamp(identity) {
  if (!identity) {
    return false;
  }
  if (identity === "-") {
    return false;
  }
  // Timestamping is required/expected for Developer ID distributions.
  return identity.includes("Developer ID Application");
}

function isMachoBinary(filePath) {
  const out = run("/usr/bin/file", ["-b", filePath], { stdio: ["ignore", "pipe", "pipe"] });
  return out.includes("Mach-O");
}

function shouldConsiderForSigning(filePath, st) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".dylib" || ext === ".node" || ext === ".so") {
    return true;
  }
  // Executable bit set.
  if ((st.mode & 0o111) !== 0) {
    return true;
  }
  return false;
}

function walkFiles(rootDir, onFile) {
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) {
      continue;
    }
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      onFile(full);
    }
  }
}

function findEntitlementsInherit() {
  // apps/electron-desktop/scripts -> apps/electron-desktop
  const appRoot = path.resolve(__dirname, "..");
  const entPath = path.join(appRoot, "entitlements.mac.inherit.plist");
  if (fs.existsSync(entPath)) {
    return entPath;
  }
  return null;
}

function codesignFile(filePath, identity, entitlements) {
  const args = ["--force", "--sign", identity];

  // Hardened runtime is recommended for distribution; it is harmless for nested binaries.
  if (identity !== "-") {
    args.push("--options", "runtime");
  }

  // Apply inherited entitlements for child binaries (JIT, library validation, etc.)
  if (entitlements) {
    args.push("--entitlements", entitlements);
  }

  if (shouldTimestamp(identity)) {
    args.push("--timestamp");
  } else {
    args.push("--timestamp=none");
  }

  args.push(filePath);

  run("/usr/bin/codesign", args, { stdio: "inherit" });
}

/**
 * electron-builder hook.
 *
 * Goal: Sign extraResources Mach-O binaries (Node runtime, gog, native addons) BEFORE
 * electron-builder applies the final app bundle signature on macOS.
 *
 * Docs: https://www.electron.build/configuration/configuration#afterpack
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  let identity;
  try {
    identity = selectSigningIdentity();
  } catch {
    identity = null;
  }

  if (!identity) {
    // No usable signing identity found. This is expected in CI without certificates.
    // Skip signing extraResources and let electron-builder handle the rest.
    console.log(
      "[electron-desktop] afterPack: no codesign identity found (skipping extraResources signing)"
    );
    return;
  }

  const appOutDir = context.appOutDir;
  const appBundle = findFirstAppBundle(appOutDir);
  if (!appBundle) {
    throw new Error(`[electron-desktop] Failed to locate .app bundle in: ${appOutDir}`);
  }

  const resourcesDir = path.join(appBundle, "Contents", "Resources");
  const candidateRoots = [
    "node",
    "gog",
    "jq",
    "memo",
    "remindctl",
    "obsidian-cli",
    "gh",
    "openclaw",
  ].map((name) => path.join(resourcesDir, name));
  const roots = candidateRoots.filter((p) => fs.existsSync(p));

  if (roots.length === 0) {
    console.log("[electron-desktop] afterPack: no extraResources roots found to sign (skipping)");
    return;
  }

  const entitlements = findEntitlementsInherit();
  console.log(`[electron-desktop] afterPack: signing extraResources with identity: ${identity}`);
  if (entitlements) {
    console.log(`[electron-desktop] afterPack: using entitlements: ${path.basename(entitlements)}`);
  }
  let signed = 0;
  let considered = 0;

  for (const root of roots) {
    walkFiles(root, (filePath) => {
      let st;
      try {
        st = fs.statSync(filePath);
      } catch {
        return;
      }
      if (!shouldConsiderForSigning(filePath, st)) {
        return;
      }
      considered += 1;
      try {
        if (!isMachoBinary(filePath)) {
          return;
        }
      } catch {
        // Ignore failures from `file` on weird inputs.
        return;
      }
      codesignFile(filePath, identity, entitlements);
      signed += 1;
    });
  }

  console.log(
    `[electron-desktop] afterPack: signed ${signed} Mach-O files (considered ${considered}) under: ${roots
      .map((p) => path.basename(p))
      .join(", ")}`
  );
};
