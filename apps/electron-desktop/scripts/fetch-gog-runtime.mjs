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
  resolveOs,
  resolveArch,
  ghHeaders,
  targetPlatform,
  targetArch,
  isCrossCompiling,
} from "./lib/script-platform.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");

// This directory is gitignored and used in dev + as input for prepare-gog-runtime.
const runtimeRoot = path.join(appRoot, ".gog-runtime");

const SUPPORTED_PLATFORMS = ["darwin", "win32"];

async function fetchJson(url) {
  if (typeof fetch !== "function") {
    throw new Error("global fetch() not available; please run this script with Node 18+");
  }
  const res = await fetch(url, {
    headers: ghHeaders("openclaw-electron-desktop/fetch-gog-runtime"),
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
        String(process.env.GOGCLI_FORCE_DOWNLOAD || "").trim() !== "1"
      ) {
        return;
      }
    } catch {
      // Ignore stat errors and continue with a download attempt.
    }
  }

  const res = await fetch(url, {
    headers: ghHeaders("openclaw-electron-desktop/fetch-gog-runtime"),
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

async function main() {
  const platform = targetPlatform();
  const arch = targetArch();

  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    throw new Error(
      `fetch-gog-runtime: unsupported platform "${platform}" (supported: ${SUPPORTED_PLATFORMS.join(", ")})`
    );
  }

  const os = resolveOs(platform);
  const assetArch = resolveArch(arch);

  const repo =
    (process.env.GOGCLI_REPO && String(process.env.GOGCLI_REPO).trim()) || "moltbot/gogcli";
  const tag = (process.env.GOGCLI_TAG && String(process.env.GOGCLI_TAG).trim()) || "latest";
  const apiUrl =
    tag === "latest"
      ? `https://api.github.com/repos/${repo}/releases/latest`
      : `https://api.github.com/repos/${repo}/releases/tags/${tag}`;

  const release = await fetchJson(apiUrl);
  const tagName = typeof release?.tag_name === "string" ? release.tag_name : "";
  const version = tagName && tagName.startsWith("v") ? tagName.slice(1) : tagName;
  if (!version) {
    throw new Error(
      `failed to resolve gogcli version from GitHub release tag: ${tagName || "<missing>"}`
    );
  }

  const isZip = os === "windows";
  const assetName = `gogcli_${version}_${os}_${assetArch}.${isZip ? "zip" : "tar.gz"}`;
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const match = assets.find((a) => a && typeof a.name === "string" && a.name === assetName);
  const downloadUrl =
    match && typeof match.browser_download_url === "string" ? match.browser_download_url : "";
  if (!downloadUrl) {
    const known = assets
      .map((a) => (a && typeof a.name === "string" ? a.name : ""))
      .filter(Boolean)
      .slice(0, 40)
      .join(", ");
    throw new Error(
      `gogcli asset not found for ${platform}/${arch}. Expected ${assetName}. Known assets (first 40): ${known || "<none>"}`
    );
  }

  const cacheDir = path.join(runtimeRoot, "_cache", `${tagName || tag}`, `${os}-${assetArch}`);
  const archivePath = path.join(cacheDir, assetName);
  const extractDir = path.join(cacheDir, "extract");

  console.log(`[electron-desktop] gog runtime dir: ${runtimeRoot}`);
  console.log(`[electron-desktop] gogcli cache dir: ${cacheDir}`);

  console.log(`[electron-desktop] Downloading gogcli: ${downloadUrl}`);
  await downloadToFile(downloadUrl, archivePath);

  if (isZip) {
    extractZip(archivePath, extractDir);
  } else {
    extractTarGz(archivePath, extractDir);
  }

  const gogBinName = binName("gog");
  const extracted = findFileRecursive(extractDir, gogBinName);
  if (!extracted) {
    throw new Error(
      `failed to locate ${gogBinName} in extracted gogcli archive (dir: ${extractDir})`
    );
  }

  const targetDir = path.join(runtimeRoot, `${platform}-${arch}`);
  const targetBin = path.join(targetDir, gogBinName);
  copyExecutable(extracted, targetBin);

  if (!isCrossCompiling()) {
    const res = spawnSync(targetBin, ["--version"], { encoding: "utf-8" });
    if (res.status !== 0) {
      const stderr = String(res.stderr || "").trim();
      const stdout = String(res.stdout || "").trim();
      throw new Error(`downloaded gog failed to run: ${stderr || stdout || "unknown error"}`);
    }
  }

  console.log(`[electron-desktop] gog downloaded to: ${targetBin}`);
}

main().catch((err) => {
  console.error(String(err?.stack || err?.message || err));
  process.exitCode = 1;
});
