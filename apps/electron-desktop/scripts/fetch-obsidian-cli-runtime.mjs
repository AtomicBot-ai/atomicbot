import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  ensureDir,
  extractZip,
  extractTarGz,
  copyExecutable,
  findFileRecursive,
  binName,
  ghHeaders,
  targetPlatform,
  targetArch,
  isCrossCompiling,
} from "./lib/script-platform.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");

// This directory is gitignored and used in dev + as input for prepare-obsidian-cli-runtime.
const runtimeRoot = path.join(appRoot, ".obsidian-cli-runtime");

const SUPPORTED_PLATFORMS = ["darwin", "win32"];

async function fetchJson(url) {
  if (typeof fetch !== "function") {
    throw new Error("global fetch() not available; please run this script with Node 18+");
  }
  const res = await fetch(url, {
    headers: ghHeaders("openclaw-electron-desktop/fetch-obsidian-cli-runtime"),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} fetching ${url}: ${text || res.statusText}`);
  }
  return await res.json();
}

async function downloadToFile(url, destPath) {
  if (typeof fetch !== "function") {
    throw new Error("global fetch() not available; please run this script with Node 18+");
  }

  // Treat an existing non-empty destination as a cache hit.
  if (fs.existsSync(destPath)) {
    try {
      const st = fs.statSync(destPath);
      if (
        st.isFile() &&
        st.size > 0 &&
        String(process.env.OBSIDIAN_CLI_FORCE_DOWNLOAD || "").trim() !== "1"
      ) {
        return;
      }
    } catch {
      // Ignore and continue with a download attempt.
    }
  }

  const res = await fetch(url, {
    headers: ghHeaders("openclaw-electron-desktop/fetch-obsidian-cli-runtime"),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} downloading ${url}: ${text || res.statusText}`);
  }
  ensureDir(path.dirname(destPath));
  const tmpPath = `${destPath}.tmp`;
  try {
    fs.rmSync(tmpPath, { force: true });
  } catch {
    // ignore
  }
  try {
    const body = res.body;
    if (!body) {
      throw new Error(`empty response body for ${url}`);
    }
    await pipeline(Readable.fromWeb(body), fs.createWriteStream(tmpPath));
    fs.renameSync(tmpPath, destPath);
  } finally {
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      // ignore
    }
  }
}

function normalizeArch(arch) {
  if (arch === "arm64") return "arm64";
  if (arch === "x64") return "amd64";
  return arch;
}

function pickAsset(assets, platform, arch) {
  const known = assets.map((a) => (a && typeof a.name === "string" ? a.name : "")).filter(Boolean);
  const normArch = normalizeArch(arch);

  const platformKeywords =
    platform === "win32" ? ["windows", "win", "win32", "win64"] : ["darwin", "mac", "macos", "osx"];

  const scored = known
    .map((name) => {
      const lower = name.toLowerCase();
      let score = 0;
      // Platform signals.
      if (platformKeywords.some((kw) => lower.includes(kw))) {
        score += 50;
      }
      // Architecture signals.
      if (lower.includes(normArch)) {
        score += 30;
      }
      if (normArch === "arm64" && (lower.includes("aarch64") || lower.includes("apple"))) {
        score += 10;
      }
      // Archive type.
      if (lower.endsWith(".zip")) {
        score += 5;
      }
      if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) {
        score += 5;
      }
      // Prefer smaller/more specific artifacts.
      if (lower.includes("checksums") || lower.includes("sha256")) {
        score -= 100;
      }
      if (lower.includes("source") || lower.endsWith(".txt")) {
        score -= 50;
      }
      return { name, score };
    })
    .filter((x) => x.score > 0)
    .toSorted((a, b) => b.score - a.score);

  const best = scored[0]?.name || "";
  if (!best) {
    return { assetName: "", downloadUrl: "", known };
  }

  const match = assets.find((a) => a && typeof a.name === "string" && a.name === best);
  const downloadUrl =
    match && typeof match.browser_download_url === "string" ? match.browser_download_url : "";
  return { assetName: best, downloadUrl, known };
}

async function main() {
  const platform = targetPlatform();
  const arch = targetArch();

  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    throw new Error(
      `fetch-obsidian-cli-runtime: unsupported platform "${platform}" (supported: ${SUPPORTED_PLATFORMS.join(", ")})`
    );
  }

  const repo =
    (process.env.OBSIDIAN_CLI_REPO && String(process.env.OBSIDIAN_CLI_REPO).trim()) ||
    "Yakitrak/obsidian-cli";
  const tag =
    (process.env.OBSIDIAN_CLI_TAG && String(process.env.OBSIDIAN_CLI_TAG).trim()) || "v0.2.3";
  const apiUrl =
    tag === "latest"
      ? `https://api.github.com/repos/${repo}/releases/latest`
      : `https://api.github.com/repos/${repo}/releases/tags/${tag}`;

  const release = await fetchJson(apiUrl);
  const tagName = typeof release?.tag_name === "string" ? release.tag_name : "";
  if (!tagName) {
    throw new Error("failed to resolve obsidian-cli release tag_name from GitHub API");
  }

  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const picked = pickAsset(assets, platform, arch);
  if (!picked.downloadUrl) {
    throw new Error(
      `obsidian-cli asset not found for ${platform}/${arch}. Known assets: ${picked.known.slice(0, 40).join(", ") || "<none>"}`
    );
  }

  const cacheDir = path.join(runtimeRoot, "_cache", `${tagName || tag}`, `${platform}-${arch}`);
  const archivePath = path.join(cacheDir, picked.assetName);
  const extractDir = path.join(cacheDir, "extract");

  console.log(`[electron-desktop] obsidian-cli runtime dir: ${runtimeRoot}`);
  console.log(`[electron-desktop] obsidian-cli cache dir: ${cacheDir}`);
  console.log(`[electron-desktop] Downloading obsidian-cli: ${picked.downloadUrl}`);
  await downloadToFile(picked.downloadUrl, archivePath);

  console.log(`[electron-desktop] Extracting obsidian-cli archive...`);
  if (picked.assetName.toLowerCase().endsWith(".zip")) {
    extractZip(archivePath, extractDir);
  } else if (
    picked.assetName.toLowerCase().endsWith(".tar.gz") ||
    picked.assetName.toLowerCase().endsWith(".tgz")
  ) {
    extractTarGz(archivePath, extractDir);
  } else {
    throw new Error(`unsupported obsidian-cli asset type: ${picked.assetName}`);
  }

  const cliBinName = binName("obsidian-cli");
  const extractedBin = findFileRecursive(extractDir, (entryName) => {
    if (entryName === "obsidian-cli" || entryName === "obsidian-cli.exe") {
      return true;
    }
    return false;
  });
  if (!extractedBin) {
    throw new Error(
      `failed to locate obsidian-cli binary in extracted archive (dir: ${extractDir})`
    );
  }

  const targetDir = path.join(runtimeRoot, `${platform}-${arch}`);
  const targetBin = path.join(targetDir, cliBinName);
  ensureDir(targetDir);
  copyExecutable(extractedBin, targetBin);

  if (!isCrossCompiling()) {
    const res = spawnSync(targetBin, ["--help"], { encoding: "utf-8" });
    if (res.status !== 0) {
      const stderr = String(res.stderr || "").trim();
      const stdout = String(res.stdout || "").trim();
      throw new Error(
        `downloaded obsidian-cli failed to run: ${stderr || stdout || "unknown error"}`
      );
    }
  }

  console.log(`[electron-desktop] obsidian-cli downloaded to: ${targetBin}`);
}

main().catch((err) => {
  console.error(String(err?.stack || err?.message || err));
  process.exitCode = 1;
});
