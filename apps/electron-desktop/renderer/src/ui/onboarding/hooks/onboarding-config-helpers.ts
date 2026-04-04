export function inferWorkspaceDirFromConfigPath(configPath: string | undefined): string {
  const raw = typeof configPath === "string" ? configPath.trim() : "";
  if (!raw) {
    return "~/openclaw-workspace";
  }
  const sep = raw.includes("\\") ? "\\" : "/";
  const idx = raw.lastIndexOf(sep);
  if (idx <= 0) {
    return "~/openclaw-workspace";
  }
  const dir = raw.slice(0, idx);
  return `${dir}${sep}workspace`;
}

export { getObject, getStringArray } from "@shared/utils/configHelpers";

export function unique(list: string[]): string[] {
  return Array.from(new Set(list));
}
