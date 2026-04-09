import { existsSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve a native script path that works from both source and dist.
 *
 * When running from source, `import.meta.url` resolves correctly via the
 * relative `../../native/...` convention. When running from the built `dist/`
 * tree the native files are not copied, so we fall back to the extension
 * package root in the source tree.
 */
export function resolveNativeScript(relativePath: string): string {
  const fromSource = join(thisDir, "..", "native", relativePath);
  if (existsSync(fromSource)) return fromSource;

  const fullPath = thisDir;
  const distMarker = `${sep}dist${sep}`;
  const idx = fullPath.indexOf(distMarker);
  if (idx >= 0) {
    const repoRoot = fullPath.slice(0, idx);
    const fallback = join(repoRoot, "extensions", "computer-use", "native", relativePath);
    if (existsSync(fallback)) return fallback;
  }

  return fromSource;
}
