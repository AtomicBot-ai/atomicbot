import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");

// This directory is gitignored and used in dev + as input for prepare-memo-runtime.
const runtimeRoot = path.join(appRoot, ".memo-runtime");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf-8", ...opts });
  if (res.status !== 0) {
    const stderr = String(res.stderr || "").trim();
    const stdout = String(res.stdout || "").trim();
    throw new Error(`${cmd} ${args.join(" ")} failed: ${stderr || stdout || `exit ${res.status}`}`);
  }
  return { stdout: String(res.stdout || ""), stderr: String(res.stderr || "") };
}

function parsePythonVersion(raw) {
  const text = String(raw || "").trim();
  const m = text.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) {
    return null;
  }
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    raw: text,
  };
}

function readPythonVersion(pythonBin) {
  const res = spawnSync(
    pythonBin,
    ["-c", "import sys; print('.'.join(map(str, sys.version_info[:3])))"],
    {
      encoding: "utf-8",
    }
  );
  if (res.status !== 0) {
    return null;
  }
  return parsePythonVersion(res.stdout);
}

function isPythonAtLeast(version, minMajor, minMinor) {
  if (!version) {
    return false;
  }
  if (version.major !== minMajor) {
    return version.major > minMajor;
  }
  return version.minor >= minMinor;
}

function resolvePythonForMemo() {
  const explicit = process.env.MEMO_PYTHON && String(process.env.MEMO_PYTHON).trim();
  const candidates = explicit ? [explicit] : ["python3.13", "python3"];

  for (const bin of candidates) {
    const v = readPythonVersion(bin);
    if (!v) {
      continue;
    }
    if (isPythonAtLeast(v, 3, 13)) {
      return { bin, version: v };
    }
  }
  const hint = explicit
    ? `MEMO_PYTHON=${explicit}`
    : "python3.13 (recommended) or set MEMO_PYTHON=/path/to/python3.13";
  throw new Error(
    [
      "memo build requires Python >= 3.13.",
      `Tried: ${candidates.join(", ")}`,
      `Hint: install python3.13 and re-run (or set ${hint}).`,
    ].join("\n")
  );
}

function resolveMemoSourceDir() {
  const tag = (process.env.MEMO_TAG && String(process.env.MEMO_TAG).trim()) || "latest";
  // fetch-memo-runtime resolves tagName; use the extracted cache. If tag is "latest", we still
  // extract into the resolved tagName folder, so we need a best-effort scan.
  const cacheRoot = path.join(runtimeRoot, "_cache");
  if (!fs.existsSync(cacheRoot)) {
    return null;
  }
  if (tag !== "latest") {
    const src = path.join(cacheRoot, tag, "src");
    return fs.existsSync(src) ? src : null;
  }
  // latest: pick the newest cache entry that has src/
  const entries = fs
    .readdirSync(cacheRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .map((name) => {
      const full = path.join(cacheRoot, name);
      const src = path.join(full, "src");
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(full).mtimeMs;
      } catch {
        // ignore
      }
      return { name, src, mtimeMs };
    })
    .filter((e) => fs.existsSync(e.src))
    .toSorted((a, b) => b.mtimeMs - a.mtimeMs);
  return entries[0]?.src ?? null;
}

async function main() {
  if (process.platform !== "darwin") {
    console.log("[electron-desktop] build-memo-runtime: skipping (macOS-only)");
    return;
  }

  const platform = process.platform;
  const arch = process.arch;
  const srcDir = resolveMemoSourceDir();
  if (!srcDir) {
    throw new Error(
      [
        "memo source not found.",
        `Expected a cache entry under: ${path.join(runtimeRoot, "_cache")}`,
        "Run: cd apps/electron-desktop && npm run fetch:memo",
      ].join("\n")
    );
  }

  const buildRoot = path.join(runtimeRoot, "_build", `${platform}-${arch}`);
  const venvDir = path.join(buildRoot, "venv");
  const outDir = path.join(runtimeRoot, `${platform}-${arch}`);
  const outBin = path.join(outDir, "memo");

  ensureDir(buildRoot);
  ensureDir(outDir);

  const resolvedPython = resolvePythonForMemo();
  const python = resolvedPython.bin;
  console.log(
    `[electron-desktop] Using Python for memo build: ${python} (${resolvedPython.version.raw})`
  );

  // Create venv if missing.
  const venvPython = path.join(venvDir, "bin", "python");
  const existingVenvPython = fs.existsSync(venvPython) ? venvPython : null;
  const existingVenvVersion = existingVenvPython ? readPythonVersion(existingVenvPython) : null;
  const shouldRecreateVenv = existingVenvVersion
    ? !isPythonAtLeast(existingVenvVersion, 3, 13)
    : false;

  if (!existingVenvPython || shouldRecreateVenv) {
    const reason = !existingVenvPython
      ? "missing"
      : `python ${existingVenvVersion?.raw ?? "unknown"} is below 3.13`;
    console.log(`[electron-desktop] Creating venv for memo build: ${venvDir} (${reason})`);
    rmrf(venvDir);
    run(python, ["-m", "venv", venvDir], { stdio: ["ignore", "pipe", "pipe"] });
  }

  if (!fs.existsSync(venvPython)) {
    throw new Error(`venv python not found at: ${venvPython}`);
  }

  // Install build deps and memo itself.
  console.log(`[electron-desktop] Installing build deps (pip, setuptools, wheel, pyinstaller)`);
  run(venvPython, ["-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  run(venvPython, ["-m", "pip", "install", "--upgrade", "pyinstaller"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  console.log(`[electron-desktop] Installing memo from source: ${srcDir}`);
  run(venvPython, ["-m", "pip", "install", "--upgrade", srcDir], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  // The upstream module defines click commands but does not run them when imported.
  // Build a tiny entry script that invokes the console_script target.
  const entryScript = path.join(buildRoot, "memo-entry.py");
  fs.writeFileSync(
    entryScript,
    ["from memo.memo import cli", "", "if __name__ == '__main__':", "    cli()", ""].join("\n"),
    { encoding: "utf-8" }
  );

  // Build a single-file executable.
  const pyDist = path.join(buildRoot, "dist");
  const pyBuild = path.join(buildRoot, "build");
  rmrf(pyDist);
  rmrf(pyBuild);

  console.log(
    `[electron-desktop] Building memo binary with PyInstaller (entry: ${path.relative(buildRoot, entryScript)})`
  );
  run(
    venvPython,
    [
      "-m",
      "PyInstaller",
      "--noconfirm",
      "--clean",
      "--onefile",
      "--name",
      "memo",
      "--distpath",
      pyDist,
      "--workpath",
      pyBuild,
      "--collect-all",
      "chardet",
      entryScript,
    ],
    { cwd: buildRoot, stdio: ["ignore", "pipe", "pipe"] }
  );

  const builtBin = path.join(pyDist, "memo");
  if (!fs.existsSync(builtBin)) {
    throw new Error(`PyInstaller output not found at: ${builtBin}`);
  }

  fs.copyFileSync(builtBin, outBin);
  fs.chmodSync(outBin, 0o755);

  // Sanity check.
  const res = spawnSync(outBin, ["--help"], { encoding: "utf-8" });
  if (res.status !== 0) {
    const stderr = String(res.stderr || "").trim();
    const stdout = String(res.stdout || "").trim();
    throw new Error(`built memo failed to run: ${stderr || stdout || "unknown error"}`);
  }

  console.log(`[electron-desktop] memo built at: ${outBin}`);
  console.log(`[electron-desktop] Next: npm run prepare:memo`);
}

main().catch((err) => {
  console.error(String(err?.stack || err?.message || err));
  process.exitCode = 1;
});
