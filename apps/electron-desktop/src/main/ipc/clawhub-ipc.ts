import { ipcMain } from "electron";

import { IPC } from "../../shared/ipc-channels";

const CLAWHUB_API_URL = process.env.CLAWHUB_API_URL || "http://localhost:3000";
const FETCH_TIMEOUT_MS = 30_000;

async function clawhubFetch<T>(
  path: string,
  search?: Record<string, string | undefined>
): Promise<T> {
  const url = new URL(path, CLAWHUB_API_URL);
  for (const [key, value] of Object.entries(search ?? {})) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(`ClawHub request timed out after ${FETCH_TIMEOUT_MS}ms`)),
    FETCH_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      const body = await response.text().catch(() => response.statusText);
      throw new Error(`ClawHub ${path} failed (${response.status}): ${body}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function clawhubFetchText(
  path: string,
  search?: Record<string, string | undefined>
): Promise<string> {
  const url = new URL(path, CLAWHUB_API_URL);
  for (const [key, value] of Object.entries(search ?? {})) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(`ClawHub request timed out after ${FETCH_TIMEOUT_MS}ms`)),
    FETCH_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      const body = await response.text().catch(() => response.statusText);
      throw new Error(`ClawHub ${path} failed (${response.status}): ${body}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export function registerClawHubHandlers() {
  ipcMain.handle(
    IPC.clawhubListSkills,
    async (
      _evt,
      params?: {
        q?: string;
        limit?: number;
        page?: number;
        sort?: string;
        dir?: string;
        nonSuspicious?: boolean;
      }
    ) => {
      try {
        const result = await clawhubFetch<{
          items: unknown[];
          total: number;
          page: number;
          limit: number;
          totalPages: number;
        }>("/api/skills", {
          q: params?.q?.trim() || undefined,
          page: params?.page ? String(params.page) : undefined,
          limit: params?.limit ? String(params.limit) : "25",
          sort: params?.sort,
          dir: params?.dir,
          nonSuspiciousOnly: params?.nonSuspicious ? "true" : undefined,
        });
        return {
          ok: true,
          items: result.items,
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
        };
      } catch (err) {
        return {
          ok: false,
          items: [],
          total: 0,
          page: 1,
          totalPages: 0,
          error: String(err instanceof Error ? err.message : err),
        };
      }
    }
  );

  ipcMain.handle(IPC.clawhubGetSkillPackage, async (_evt, params: { slug?: string }) => {
    const slug = typeof params?.slug === "string" ? params.slug.trim() : "";
    if (!slug) {
      return { ok: false, error: "Package slug is required" };
    }
    try {
      const result = await clawhubFetch<Record<string, unknown>>(
        `/api/skills/${encodeURIComponent(slug)}`
      );
      return { ok: true, package: result };
    } catch (err) {
      return { ok: false, error: String(err instanceof Error ? err.message : err) };
    }
  });

  ipcMain.handle(
    IPC.clawhubGetSkillFile,
    async (_evt, params: { slug?: string; path?: string }) => {
      const slug = typeof params?.slug === "string" ? params.slug.trim() : "";
      const filePath = typeof params?.path === "string" ? params.path.trim() : "";
      if (!slug || !filePath) {
        return { ok: false, error: "Slug and file path are required" };
      }
      try {
        const content = await clawhubFetchText(`/api/skills/${encodeURIComponent(slug)}/files`, {
          path: filePath,
        });
        return { ok: true, content };
      } catch (err) {
        return { ok: false, error: String(err instanceof Error ? err.message : err) };
      }
    }
  );

  ipcMain.handle(
    IPC.clawhubGetComments,
    async (_evt, params: { slug?: string; limit?: number }) => {
      const slug = typeof params?.slug === "string" ? params.slug.trim() : "";
      if (!slug) {
        return { ok: false, comments: [], error: "Slug is required" };
      }
      try {
        const comments = await clawhubFetch<unknown[]>(
          `/api/skills/${encodeURIComponent(slug)}/comments`,
          { limit: params?.limit ? String(params.limit) : "50" }
        );
        return { ok: true, comments };
      } catch (err) {
        return {
          ok: false,
          comments: [],
          error: String(err instanceof Error ? err.message : err),
        };
      }
    }
  );
}
