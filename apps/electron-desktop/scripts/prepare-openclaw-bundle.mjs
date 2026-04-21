import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALWAYS_KEEP_PACKAGES,
  NODE_BUILTINS,
  PRUNE_LINK_NAMES,
  PRUNE_PREFIXES,
  PRUNE_SCOPED_NAMES,
  STRIP_DIR_NAMES,
  STRIP_EXACT_NAMES,
  STRIP_EXTENSIONS,
  isSafeMode,
  readGeneratedExternals,
  resolveEsbuildExternals,
  writeGeneratedExternals,
} from "./lib/openclaw-bundle-config.mjs";
import { verifyBundle } from "./lib/openclaw-bundle-verify.mjs";
import {
  collectDistSubdirPackages,
  collectExternalPackagesFromMetafile,
  ensureDir,
  inferPackageFromEsbuildErrorMessage,
  isPackageCoveredByExternals,
  pnpmEntryPrefixForPackage,
  rmrfStrict,
  run,
  tryRemove,
  uniqSortedStrings,
} from "./lib/openclaw-bundle-utils.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const repoRoot = path.resolve(appRoot, "..", "..");
const outDir = path.join(appRoot, "vendor", "openclaw");
const nmDir = path.join(outDir, "node_modules");
const PNPM = process.env.PNPM_BIN || "pnpm";

const safeMode = isSafeMode();
const skipVerify = /^(1|true|yes)$/i.test(
  String(process.env.OPENCLAW_BUNDLE_SKIP_VERIFY || "").trim()
);
const persistGeneratedExternals = /^(1|true|yes)$/i.test(
  String(process.env.OPENCLAW_BUNDLE_WRITE_GENERATED_EXTERNALS || "").trim()
);
const strictGeneratedExternals = /^(1|true|yes)$/i.test(
  String(process.env.OPENCLAW_BUNDLE_STRICT_EXTERNALS || "").trim()
);
console.log(`[electron-desktop] prepare-openclaw-bundle safe mode: ${safeMode ? "on" : "off"}`);

function logAdaptiveExternal(pkgName) {
  console.log(`[electron-desktop] Added adaptive external: ${pkgName}`);
}

// Redirect relative imports that resolve under vendor/openclaw/src/ to
// vendor/openclaw/dist/ (src/ is not deployed; only dist/ exists).
function createVendorSrcToDistPlugin(vendorDir) {
  const srcDir = path.join(vendorDir, "src");
  const distDir = path.join(vendorDir, "dist");
  return {
    name: "vendor-src-to-dist",
    setup(build) {
      build.onResolve({ filter: /^\./ }, (args) => {
        if (!args.importer) return null;
        const resolved = path.resolve(path.dirname(args.importer), args.path);
        if (!resolved.startsWith(srcDir + path.sep) && !resolved.startsWith(srcDir + "/"))
          return null;
        const rel = path.relative(srcDir, resolved);
        const distPath = path.join(distDir, rel);
        for (const candidate of [distPath, distPath.replace(/\.ts$/, ".js")]) {
          if (fs.existsSync(candidate)) return { path: candidate };
        }
        return { path: args.path, external: true };
      });
    },
  };
}

/**
 * Post-process the bundled entry.js to guard the playwright-core `coreDir`
 * resolution.
 *
 * Problem: when esbuild inlines playwright-core into our ESM entry, the
 * relative `require.resolve("../../../package.json")` call in
 * `nodePlatform.js` runs from the bundled file's directory and cannot find
 * playwright-core's package.json — it throws `MODULE_NOT_FOUND`, which
 * bubbles up through pw-ai-module loading as the generic
 * "Playwright is not available in this gateway build" error.
 *
 * Fix: wrap the call in try/catch and fall back to `__dirname`. Every other
 * code path inside playwright-core uses `coreDir` only to build further
 * paths, and __dirname is an equally valid root when the module is embedded
 * in our bundle.
 *
 * We apply the fix to the bundled file rather than to playwright-core
 * sources so the patch is self-contained and survives pnpm/playwright
 * upgrades. The regex tolerates whichever `import_pathN` alias esbuild
 * picked this build.
 */
function applyPlaywrightCoreDirGuard(bundledPath) {
  let content;
  try {
    content = fs.readFileSync(bundledPath, "utf8");
  } catch {
    return;
  }
  const pattern =
    /var coreDir = (import_path\d+)\.default\.dirname\(__require\.resolve\("\.\.\/\.\.\/\.\.\/package\.json"\)\);/;
  const match = content.match(pattern);
  if (!match) {
    console.log(
      "[electron-desktop] playwright-core coreDir guard: target line not found (already patched or playwright-core changed)"
    );
    return;
  }
  const pathAlias = match[1];
  const replacement =
    `var coreDir = (() => { try { return ${pathAlias}.default.dirname(__require.resolve("../../../package.json")); } ` +
    'catch { return typeof __dirname === "string" ? __dirname : ""; } })();';
  const patched = content.replace(pattern, replacement);
  fs.writeFileSync(bundledPath, patched);
  console.log("[electron-desktop] Applied playwright-core coreDir guard");
}

async function buildEntryWithAdaptiveExternals(params) {
  const { esbuild, entryJs, bundledPath, initialExternals, plugins } = params;
  const adaptive = new Set();
  const maxAttempts = 12;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const effectiveExternals = resolveEsbuildExternals({
      additional: [...adaptive, ...initialExternals],
    });
    try {
      const mainBuild = await esbuild.build({
        entryPoints: [entryJs],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: bundledPath,
        metafile: true,
        logLimit: 0,
        external: [...effectiveExternals, "node:*", ...NODE_BUILTINS],
        plugins: plugins || [],
        banner: {
          js:
            // createRequire lets bundled CommonJS modules (playwright-core
            // among them) continue calling `require(...)` at runtime under an
            // ESM entry point.
            'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' +
            // __filename / __dirname polyfills. When esbuild inlines CommonJS
            // packages (notably playwright-core) into an ESM bundle, they keep
            // references to __filename/__dirname. Without this shim those are
            // `undefined` at runtime and the module throws a ReferenceError on
            // load — which surfaces to users as the misleading
            // "Playwright is not available in this gateway build" message.
            'import { fileURLToPath as __sigmaFileURLToPath } from "node:url";' +
            'import { dirname as __sigmaDirname } from "node:path";' +
            "const __filename = __sigmaFileURLToPath(import.meta.url);" +
            "const __dirname = __sigmaDirname(__filename);",
        },
      });
      applyPlaywrightCoreDirGuard(bundledPath);
      return { mainBuild, adaptive, effectiveExternals };
    } catch (err) {
      const pkg = inferPackageFromEsbuildErrorMessage(
        err instanceof Error ? err.message : String(err)
      );
      if (!pkg || NODE_BUILTINS.has(pkg) || isPackageCoveredByExternals(pkg, effectiveExternals)) {
        throw err;
      }
      adaptive.add(pkg);
      logAdaptiveExternal(pkg);
    }
  }

  throw new Error(
    "[electron-desktop] Failed to bundle dist/entry.js after adaptive external retries"
  );
}

function verifyControlUiBuilt() {
  const controlUiIndex = path.join(repoRoot, "dist", "control-ui", "index.html");
  if (!fs.existsSync(controlUiIndex)) {
    throw new Error(
      `[electron-desktop] Control UI assets missing after build: ${controlUiIndex}. Did ui:build output change?`
    );
  }
}

function hoistPnpmVirtualStoreToRoot() {
  const pnpmHoistedDir = path.join(outDir, "node_modules", ".pnpm", "node_modules");
  if (!fs.existsSync(pnpmHoistedDir)) return;

  let hoisted = 0;
  for (const entry of fs.readdirSync(pnpmHoistedDir, { withFileTypes: true })) {
    if (entry.name === ".bin") continue;
    const rootTarget = path.join(nmDir, entry.name);

    if (entry.name.startsWith("@")) {
      const scopeDir = path.join(pnpmHoistedDir, entry.name);
      for (const sub of fs.readdirSync(scopeDir, { withFileTypes: true })) {
        const scopedTarget = path.join(rootTarget, sub.name);
        if (fs.existsSync(scopedTarget)) continue;
        ensureDir(rootTarget);
        fs.symlinkSync(path.join(scopeDir, sub.name), scopedTarget, "junction");
        hoisted++;
      }
      continue;
    }

    if (!fs.existsSync(rootTarget)) {
      fs.symlinkSync(path.join(pnpmHoistedDir, entry.name), rootTarget, "junction");
      hoisted++;
    }
  }
  if (hoisted > 0) {
    console.log(`[electron-desktop] Hoisted ${hoisted} packages from .pnpm/node_modules/ to root`);
  }
}

function pruneKnownUnneededPackages() {
  const pnpmStore = path.join(nmDir, ".pnpm");
  if (!fs.existsSync(pnpmStore)) return;

  let removed = 0;
  for (const entry of fs.readdirSync(pnpmStore)) {
    if (!PRUNE_PREFIXES.some((prefix) => entry.startsWith(prefix))) continue;
    fs.rmSync(path.join(pnpmStore, entry), { recursive: true, force: true });
    removed++;
  }

  const pnpmHoisted = path.join(pnpmStore, "node_modules");
  if (fs.existsSync(pnpmHoisted)) {
    for (const name of [...PRUNE_LINK_NAMES, ...PRUNE_SCOPED_NAMES]) {
      if (tryRemove(path.join(pnpmHoisted, name))) removed++;
    }
  }

  // Remove dangling links from each package-local node_modules/
  // (e.g. .pnpm/<pkg>/node_modules/koffi after koffi package removal).
  for (const pnpmDir of fs.readdirSync(pnpmStore)) {
    if (pnpmDir === "node_modules" || pnpmDir === "lock.yaml") continue;
    const pkgNm = path.join(pnpmStore, pnpmDir, "node_modules");
    try {
      fs.statSync(pkgNm);
    } catch {
      continue;
    }
    for (const name of [...PRUNE_LINK_NAMES, ...PRUNE_SCOPED_NAMES]) {
      if (tryRemove(path.join(pkgNm, name))) removed++;
    }
  }

  for (const name of [...PRUNE_LINK_NAMES, ...PRUNE_SCOPED_NAMES]) {
    if (tryRemove(path.join(nmDir, name))) removed++;
  }
  if (removed > 0) {
    console.log(`[electron-desktop] Pruned ${removed} known-unneeded entries from vendor bundle`);
  }
}

function stripJunkFiles(dir) {
  let stripped = 0;
  const queue = [dir];
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) continue;

    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        if (STRIP_DIR_NAMES.has(entry.name)) {
          try {
            fs.rmSync(full, { recursive: true, force: true });
            stripped++;
          } catch {}
          continue;
        }
        if (!entry.isSymbolicLink()) queue.push(full);
        continue;
      }

      if (!entry.isFile()) continue;
      if (STRIP_EXACT_NAMES.has(entry.name)) {
        try {
          fs.unlinkSync(full);
          stripped++;
        } catch {}
        continue;
      }
      const lower = entry.name.toLowerCase();
      for (const ext of STRIP_EXTENSIONS) {
        if (!lower.endsWith(ext)) continue;
        try {
          fs.unlinkSync(full);
          stripped++;
        } catch {}
        break;
      }
    }
  }
  return stripped;
}

function traceKeepEntries(params) {
  const { pnpmStoreDir, packageNames } = params;
  const keepEntries = new Set();

  function traceEntry(entryName) {
    if (keepEntries.has(entryName)) return;
    keepEntries.add(entryName);
    const entryNm = path.join(pnpmStoreDir, entryName, "node_modules");
    let deps = [];
    try {
      deps = fs.readdirSync(entryNm, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dep of deps) {
      if (dep.name === ".bin") continue;
      const depPath = path.join(entryNm, dep.name);
      const resolveAndTrace = (p) => {
        try {
          const target = fs.realpathSync(p);
          const rel = path.relative(nmDir, target).split(path.sep);
          if (rel[0] === ".pnpm" && rel[1]) traceEntry(rel[1]);
        } catch {}
      };
      if (dep.name.startsWith("@")) {
        try {
          for (const sub of fs.readdirSync(depPath)) resolveAndTrace(path.join(depPath, sub));
        } catch {}
      } else {
        resolveAndTrace(depPath);
      }
    }
  }

  const pnpmEntries = fs
    .readdirSync(pnpmStoreDir)
    .filter((e) => e !== "node_modules" && e !== "lock.yaml");
  for (const pkg of packageNames) {
    try {
      const target = fs.realpathSync(path.join(nmDir, pkg));
      const rel = path.relative(nmDir, target).split(path.sep);
      if (rel[0] === ".pnpm" && rel[1]) traceEntry(rel[1]);
      continue;
    } catch {}

    const prefix = pnpmEntryPrefixForPackage(pkg);
    for (const entry of pnpmEntries) {
      if (entry.startsWith(prefix)) traceEntry(entry);
    }
  }

  return keepEntries;
}

function deepHoistSubDependencies(pnpmStoreDir) {
  const safeLink = (src, dest) => {
    try {
      fs.symlinkSync(src, dest, "junction");
      return true;
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && err.code === "EEXIST") {
        return false;
      }
      throw err;
    }
  };

  let deepHoisted = 0;
  for (const pnpmEntry of fs.readdirSync(pnpmStoreDir)) {
    if (pnpmEntry === "node_modules" || pnpmEntry === "lock.yaml") continue;
    const entryNm = path.join(pnpmStoreDir, pnpmEntry, "node_modules");
    let deps = [];
    try {
      deps = fs.readdirSync(entryNm, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const dep of deps) {
      if (dep.name === ".bin") continue;
      const rootTarget = path.join(nmDir, dep.name);
      const source = path.join(entryNm, dep.name);
      if (dep.name.startsWith("@")) {
        try {
          for (const sub of fs.readdirSync(source, { withFileTypes: true })) {
            const scopedTarget = path.join(rootTarget, sub.name);
            if (fs.existsSync(scopedTarget)) continue;
            ensureDir(rootTarget);
            if (safeLink(path.join(source, sub.name), scopedTarget)) {
              deepHoisted++;
            }
          }
        } catch {}
      } else if (!fs.existsSync(rootTarget)) {
        if (safeLink(source, rootTarget)) {
          deepHoisted++;
        }
      }
    }
  }
  if (deepHoisted > 0) {
    console.log(
      `[electron-desktop] Deep-hoisted ${deepHoisted} sub-dependencies to root node_modules`
    );
  }
}

function removeDanglingLinks(pnpmStoreDir) {
  let removedLinks = 0;

  for (const entry of fs.readdirSync(nmDir)) {
    if (entry === ".pnpm" || entry === ".bin" || entry === ".modules.yaml") continue;
    const entryPath = path.join(nmDir, entry);

    if (entry.startsWith("@")) {
      try {
        for (const sub of fs.readdirSync(entryPath)) {
          const subPath = path.join(entryPath, sub);
          try {
            fs.statSync(subPath);
          } catch {
            if (tryRemove(subPath)) removedLinks++;
          }
        }
        try {
          if (fs.readdirSync(entryPath).length === 0 && tryRemove(entryPath)) {
            removedLinks++;
          }
        } catch {
          // ignore
        }
      } catch {
        // ignore
      }
      continue;
    }

    try {
      fs.statSync(entryPath);
    } catch {
      if (tryRemove(entryPath)) removedLinks++;
    }
  }

  const pnpmHoistedDir = path.join(pnpmStoreDir, "node_modules");
  if (fs.existsSync(pnpmHoistedDir)) {
    for (const entry of fs.readdirSync(pnpmHoistedDir)) {
      if (entry === ".bin") continue;
      const entryPath = path.join(pnpmHoistedDir, entry);
      if (entry.startsWith("@")) {
        try {
          for (const sub of fs.readdirSync(entryPath)) {
            const subPath = path.join(entryPath, sub);
            try {
              fs.statSync(subPath);
            } catch {
              if (tryRemove(subPath)) removedLinks++;
            }
          }
          try {
            if (fs.readdirSync(entryPath).length === 0 && tryRemove(entryPath)) {
              removedLinks++;
            }
          } catch {
            // ignore
          }
        } catch {
          // ignore
        }
      } else {
        try {
          fs.statSync(entryPath);
        } catch {
          if (tryRemove(entryPath)) removedLinks++;
        }
      }
    }
  }

  if (removedLinks > 0) {
    console.log(`[electron-desktop] Removed ${removedLinks} dangling symlinks`);
  }
}

async function main() {
  rmrfStrict(outDir);
  ensureDir(path.dirname(outDir));

  run(PNPM, ["-C", repoRoot, "build"]);
  run(PNPM, ["-C", repoRoot, "ui:build"]);
  verifyControlUiBuilt();
  run(PNPM, ["-C", repoRoot, "--filter", "openclaw", "--prod", "--legacy", "deploy", outDir]);

  hoistPnpmVirtualStoreToRoot();
  pruneKnownUnneededPackages();

  if (fs.existsSync(nmDir)) {
    const stripped = stripJunkFiles(nmDir);
    if (stripped > 0)
      console.log(`[electron-desktop] Stripped ${stripped} unnecessary files from node_modules`);
  }

  const distDir = path.join(outDir, "dist");
  const entryJs = path.join(distDir, "entry.js");
  let externalPkgs = new Set(ALWAYS_KEEP_PACKAGES);
  let esbuild;
  let effectiveExternals = resolveEsbuildExternals();
  const learnedAdaptiveExternals = new Set();

  if (fs.existsSync(entryJs)) {
    console.log("[electron-desktop] Bundling dist/ with esbuild...");
    esbuild = await import("esbuild");
    const bundledPath = path.join(distDir, "entry.bundled.js");

    const vendorSrcPlugin = createVendorSrcToDistPlugin(outDir);

    const adaptiveBuild = await buildEntryWithAdaptiveExternals({
      esbuild,
      entryJs,
      bundledPath,
      initialExternals: [],
      plugins: [vendorSrcPlugin],
    });
    const mainBuild = adaptiveBuild.mainBuild;
    effectiveExternals = adaptiveBuild.effectiveExternals;
    for (const pkg of adaptiveBuild.adaptive) {
      learnedAdaptiveExternals.add(pkg);
    }

    for (const p of collectExternalPackagesFromMetafile({
      metafile: mainBuild.metafile,
      nodeBuiltins: NODE_BUILTINS,
    })) {
      externalPkgs.add(p);
    }

    const discovered = await collectDistSubdirPackages({
      distDir,
      esbuild,
      bundleExternals: effectiveExternals,
      nodeBuiltins: NODE_BUILTINS,
    });
    for (const p of discovered.packages) externalPkgs.add(p);

    for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (entry.name === "entry.bundled.js" || entry.name.startsWith("warning-filter")) continue;
      if (discovered.preserveFiles.has(entry.name)) continue;
      fs.unlinkSync(path.join(distDir, entry.name));
    }
    fs.renameSync(bundledPath, entryJs);

    if (process.platform === "win32") {
      // Bundle extensions BEFORE tree-shaking .pnpm so extension-only deps
      // (e.g. @pierre/diffs) are still resolvable during esbuild.  Once inlined
      // into the extension bundle they can be safely pruned from node_modules.
      //
      // nodePaths includes pnpm's hoisted virtual-store directory so esbuild can
      // resolve extension-only deps that aren't in the deployed vendor node_modules
      // (pnpm deploy only includes root-level production deps).
      const extensionsDir = path.join(outDir, "extensions");
      const pnpmHoisted = path.join(repoRoot, "node_modules", ".pnpm", "node_modules");
      const extNodePaths = [nmDir, ...(fs.existsSync(pnpmHoisted) ? [pnpmHoisted] : [])];
      if (fs.existsSync(extensionsDir)) {
        const esbuildForExt = esbuild || (await import("esbuild"));
        for (const extEntry of fs.readdirSync(extensionsDir, { withFileTypes: true })) {
          if (!extEntry.isDirectory()) continue;
          const extDir = path.join(extensionsDir, extEntry.name);
          const extIndex = path.join(extDir, "index.ts");
          if (!fs.existsSync(extIndex)) continue;
          const bundledFile = path.join(extDir, "_bundled.js");
          await esbuildForExt.build({
            entryPoints: [extIndex],
            bundle: true,
            platform: "node",
            format: "esm",
            outfile: bundledFile,
            logLimit: 0,
            nodePaths: extNodePaths,
            plugins: [vendorSrcPlugin],
            external: [
              "openclaw/plugin-sdk",
              "openclaw/plugin-sdk/*",
              "node:*",
              ...effectiveExternals,
            ],
          });
          for (const f of fs.readdirSync(extDir, { withFileTypes: true })) {
            if (
              f.name === "package.json" ||
              f.name === "_bundled.js" ||
              f.name === "openclaw.plugin.json"
            )
              continue;
            fs.rmSync(path.join(extDir, f.name), { recursive: true, force: true });
          }
          fs.renameSync(bundledFile, extIndex);
        }
      }

      const pnpmStoreDir = path.join(nmDir, ".pnpm");
      if (fs.existsSync(pnpmStoreDir)) {
        const keepEntries = traceKeepEntries({ pnpmStoreDir, packageNames: [...externalPkgs] });
        let removedEntries = 0;
        for (const entry of fs.readdirSync(pnpmStoreDir)) {
          if (entry === "node_modules" || entry === "lock.yaml") continue;
          if (keepEntries.has(entry)) continue;
          fs.rmSync(path.join(pnpmStoreDir, entry), { recursive: true, force: true });
          removedEntries++;
        }
        console.log(
          `[electron-desktop] Removed ${removedEntries} .pnpm entries (kept ${keepEntries.size})`
        );
        removeDanglingLinks(pnpmStoreDir);
        deepHoistSubDependencies(pnpmStoreDir);
      }
    } else {
      console.log(
        "[electron-desktop] Skipped extension rebundling and .pnpm pruning (macOS build)"
      );
    }

    console.log(`[electron-desktop] ${externalPkgs.size} external packages kept`);
  } else {
    console.log("[electron-desktop] dist/entry.js not found, skipping esbuild bundling");
  }

  if (persistGeneratedExternals && learnedAdaptiveExternals.size > 0) {
    const updated = uniqSortedStrings([...readGeneratedExternals(), ...learnedAdaptiveExternals]);
    writeGeneratedExternals(updated);
    console.log(
      `[electron-desktop] Persisted ${learnedAdaptiveExternals.size} adaptive externals to generated list`
    );
  } else if (learnedAdaptiveExternals.size > 0) {
    console.log(
      `[electron-desktop] Learned adaptive externals for this run: ${[...learnedAdaptiveExternals].join(", ")}`
    );
    console.log(
      "[electron-desktop] To persist them, rerun with OPENCLAW_BUNDLE_WRITE_GENERATED_EXTERNALS=1"
    );
  }

  if (strictGeneratedExternals && learnedAdaptiveExternals.size > 0) {
    throw new Error(
      [
        "[electron-desktop] Strict externals mode failed: adaptive externals were required.",
        `Learned: ${[...learnedAdaptiveExternals].join(", ")}`,
        "Run: npm run refresh:openclaw-externals",
        "Then commit scripts/lib/openclaw-bundle-generated-externals.json",
      ].join("\n")
    );
  }

  // macOS codesign --verify --deep --strict rejects bundles with symlinks that
  // point outside the bundle or to non-existent targets.  pnpm deploy and the
  // hoisting helpers above create absolute symlinks; convert them to relative
  // and remove any dangling ones so the final .app bundle passes verification.
  if (fs.existsSync(nmDir)) {
    let converted = 0;
    let removed = 0;
    const queue = [nmDir];
    while (queue.length > 0) {
      const dir = queue.pop();
      if (!dir) continue;
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) {
          const target = fs.readlinkSync(full);
          let alive = true;
          try {
            fs.statSync(full);
          } catch {
            alive = false;
          }
          if (!alive) {
            fs.rmSync(full, { recursive: true, force: true });
            removed++;
            continue;
          }
          if (path.isAbsolute(target)) {
            const relTarget = path.relative(dir, target);
            fs.unlinkSync(full);
            fs.symlinkSync(relTarget, full, "junction");
            converted++;
          }
          continue;
        }
        if (entry.isDirectory()) {
          queue.push(full);
        }
      }
    }
    if (converted > 0 || removed > 0) {
      console.log(
        `[electron-desktop] Symlink fixup: ${converted} converted to relative, ${removed} dangling removed`
      );
    }
  }

  if (!skipVerify) {
    verifyBundle({ outDir });
  } else {
    console.log("[electron-desktop] Bundle verification skipped by OPENCLAW_BUNDLE_SKIP_VERIFY");
  }

  console.log(`[electron-desktop] OpenClaw bundle prepared at: ${outDir}`);
}

await main();
