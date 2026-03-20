/**
 * IPC handlers for custom skill installation, listing, and removal.
 */
import { ipcMain } from "electron";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

import JSZip from "jszip";

import type { CustomSkillMeta } from "../../shared/types";
import type { SkillHandlerParams } from "./types";

/**
 * Parse SKILL.md frontmatter to extract name, description, and emoji.
 */
export function parseSkillFrontmatter(content: string): Omit<CustomSkillMeta, "dirName"> {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    return { name: "", description: "", emoji: "🧩" };
  }
  const block = fmMatch[1] ?? "";
  const nameMatch = block.match(/^name:\s*(.+)$/m);
  const name = nameMatch?.[1]?.trim() ?? "";
  const descMatch = block.match(/^description:\s*(.+)$/m);
  const description = descMatch?.[1]?.trim() ?? "";
  let emoji = "🦞";
  const emojiMatch = block.match(/"emoji"\s*:\s*"([^"]+)"/);
  if (emojiMatch?.[1]) {
    emoji = emojiMatch[1];
  }
  return { name, description, emoji };
}

/**
 * Extract a zip buffer into destDir using JSZip.
 * Validates that no entry escapes the destination directory.
 */
export async function extractZipBuffer(buffer: Buffer, destDir: string): Promise<void> {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);
  for (const entry of entries) {
    const entryPath = entry.name.replaceAll("\\", "/");
    if (!entryPath || entryPath.endsWith("/")) {
      const dirPath = path.resolve(destDir, entryPath);
      if (!dirPath.startsWith(destDir)) {
        throw new Error(`zip entry escapes destination: ${entry.name}`);
      }
      await fsp.mkdir(dirPath, { recursive: true });
      continue;
    }
    const outPath = path.resolve(destDir, entryPath);
    if (!outPath.startsWith(destDir)) {
      throw new Error(`zip entry escapes destination: ${entry.name}`);
    }
    await fsp.mkdir(path.dirname(outPath), { recursive: true });
    const data = await entry.async("nodebuffer");
    await fsp.writeFile(outPath, data);
  }
}

/**
 * After extraction, determine the skill root directory.
 */
export async function resolveSkillRoot(extractDir: string): Promise<string> {
  const entries = await fsp.readdir(extractDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  if (dirs.length === 1 && dirs[0]) {
    const candidate = path.join(extractDir, dirs[0].name);
    try {
      await fsp.stat(path.join(candidate, "SKILL.md"));
      return candidate;
    } catch (err) {
      console.warn("[ipc/skills] resolveSkillRoot candidate stat failed:", err);
    }
  }
  try {
    await fsp.stat(path.join(extractDir, "SKILL.md"));
    return extractDir;
  } catch (err) {
    console.warn("[ipc/skills] resolveSkillRoot extractDir SKILL.md not found:", err);
  }
  if (dirs.length === 1 && dirs[0]) {
    return path.join(extractDir, dirs[0].name);
  }
  return extractDir;
}

/**
 * Scan the workspace skills directory and return metadata for each custom skill.
 */
export async function listCustomSkillsFromDir(skillsDir: string): Promise<CustomSkillMeta[]> {
  try {
    await fsp.stat(skillsDir);
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT") {
      // Missing custom-skills folder is a normal state before the first install.
      return [];
    }
    console.warn("[ipc/skills] listCustomSkillsFromDir stat failed:", err);
    return [];
  }
  const entries = await fsp.readdir(skillsDir, { withFileTypes: true });
  const skills: CustomSkillMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const skillMdPath = path.join(skillsDir, entry.name, "SKILL.md");
    try {
      const content = await fsp.readFile(skillMdPath, "utf-8");
      const meta = parseSkillFrontmatter(content);
      skills.push({
        name: meta.name || entry.name,
        description: meta.description,
        emoji: meta.emoji,
        dirName: entry.name,
      });
    } catch (err) {
      console.warn("[ipc/skills] listCustomSkillsFromDir read SKILL.md failed:", err);
    }
  }
  return skills;
}

export function registerSkillHandlers(params: SkillHandlerParams) {
  const workspaceSkillsDir = path.join(params.stateDir, "workspace", "skills");

  ipcMain.handle("install-custom-skill", async (_evt, p: { data?: unknown }) => {
    const b64 = typeof p?.data === "string" ? p.data : "";
    if (!b64) {
      return { ok: false, error: "No data provided" };
    }

    const tmpDir = path.join(os.tmpdir(), `openclaw-skill-${randomBytes(8).toString("hex")}`);
    try {
      const buffer = Buffer.from(b64, "base64");
      await fsp.mkdir(tmpDir, { recursive: true });
      await extractZipBuffer(buffer, tmpDir);

      const skillRoot = await resolveSkillRoot(tmpDir);

      const skillMdPath = path.join(skillRoot, "SKILL.md");
      try {
        await fsp.stat(skillMdPath);
      } catch (err) {
        console.warn("[ipc/skills] install-custom-skill SKILL.md stat failed:", err);
        return { ok: false, error: "SKILL.md not found in the archive" };
      }

      const content = await fsp.readFile(skillMdPath, "utf-8");
      const meta = parseSkillFrontmatter(content);

      const dirName = (meta.name || path.basename(skillRoot)).replace(/[^a-zA-Z0-9._-]/g, "-");
      if (!dirName) {
        return { ok: false, error: "Could not determine skill name" };
      }

      const destDir = path.join(workspaceSkillsDir, dirName);
      await fsp.mkdir(workspaceSkillsDir, { recursive: true });

      try {
        await fsp.rm(destDir, { recursive: true, force: true });
      } catch (err) {
        console.warn("[ipc/skills] install-custom-skill rm destDir failed:", err);
      }

      await fsp.cp(skillRoot, destDir, { recursive: true });

      return {
        ok: true,
        skill: {
          name: meta.name || dirName,
          description: meta.description,
          emoji: meta.emoji,
          dirName,
        } satisfies CustomSkillMeta,
      };
    } catch (err) {
      return { ok: false, error: `Failed to install skill: ${String(err)}` };
    } finally {
      try {
        await fsp.rm(tmpDir, { recursive: true, force: true });
      } catch (err) {
        console.warn("[ipc/skills] install-custom-skill cleanup tmpDir failed:", err);
      }
    }
  });

  ipcMain.handle("list-custom-skills", async () => {
    try {
      const skills = await listCustomSkillsFromDir(workspaceSkillsDir);
      return { ok: true, skills };
    } catch (err) {
      console.warn("[ipc/skills] list-custom-skills failed:", err);
      return { ok: true, skills: [] as CustomSkillMeta[] };
    }
  });

  ipcMain.handle("remove-custom-skill", async (_evt, p: { dirName?: unknown }) => {
    const dirName = typeof p?.dirName === "string" ? p.dirName.trim() : "";
    if (!dirName) {
      return { ok: false, error: "Skill directory name is required" };
    }
    if (dirName.includes("/") || dirName.includes("\\") || dirName === ".." || dirName === ".") {
      return { ok: false, error: "Invalid skill name" };
    }
    const targetDir = path.join(workspaceSkillsDir, dirName);
    if (!targetDir.startsWith(workspaceSkillsDir)) {
      return { ok: false, error: "Invalid skill path" };
    }
    try {
      await fsp.rm(targetDir, { recursive: true, force: true });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: `Failed to remove skill: ${String(err)}` };
    }
  });
}
