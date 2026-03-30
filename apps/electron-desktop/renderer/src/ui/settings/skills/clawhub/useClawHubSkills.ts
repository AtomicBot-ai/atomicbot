import React from "react";
import { getDesktopApi } from "@ipc/desktopApi";

export type ClawHubBadges = {
  highlighted: boolean;
  official: boolean;
  deprecated: boolean;
};

export type ClawHubStats = {
  downloads: number;
  installsCurrent: number;
  installsAllTime: number;
  stars: number;
  versions: number;
  comments: number;
};

export type ClawHubOwner = {
  handle: string;
  displayName: string;
  image?: string;
  kind: string;
};

export type ClawHubVersion = {
  version: string;
  createdAt: number;
  changelog?: string;
  changelogSource?: string | null;
};

export type ClawHubSkillItem = {
  slug: string;
  displayName: string;
  summary?: string;
  emoji?: string | null;
  badges: ClawHubBadges;
  stats: ClawHubStats;
  owner?: ClawHubOwner | null;
  latestVersion?: ClawHubVersion | null;
  createdAt: number;
  updatedAt: number;
};

export type ClawHubFileEntry = {
  path: string;
  size: number;
  sha256?: string;
  contentType?: string;
};

export type ClawHubCommentUser = {
  handle: string;
  displayName: string;
  image?: string;
};

export type ClawHubComment = {
  id: string;
  user: ClawHubCommentUser;
  body: string;
  createdAt: number;
};

export type ClawHubModeration = {
  isPendingScan: boolean;
  isMalwareBlocked: boolean;
  isSuspicious: boolean;
  isHiddenByMod: boolean;
  isRemoved: boolean;
  verdict?: string | null;
  reasonCodes: string[];
  summary?: string | null;
};

export type ClawHubVtAnalysis = {
  status: string;
  verdict: string;
  analysis?: string | null;
  source?: string | null;
  checkedAt: number;
};

export type ClawHubLlmDimension = {
  name: string;
  label: string;
  rating: string;
  detail: string;
};

export type ClawHubLlmAnalysis = {
  status: string;
  verdict: string;
  confidence: string;
  summary?: string | null;
  guidance?: string | null;
  model?: string | null;
  checkedAt: number;
  dimensions?: ClawHubLlmDimension[] | null;
};

export type ClawHubSkillPackageDetail = {
  slug: string;
  displayName: string;
  summary?: string;
  emoji?: string | null;
  badges: ClawHubBadges;
  stats: ClawHubStats;
  owner?: ClawHubOwner | null;
  latestVersion?: ClawHubVersion | null;
  createdAt: number;
  updatedAt: number;
  sourceId?: string;
  license?: string | null;
  platforms?: string[] | null;
  files?: ClawHubFileEntry[] | null;
  moderation?: ClawHubModeration | null;
  vtAnalysis?: ClawHubVtAnalysis | null;
  llmAnalysis?: ClawHubLlmAnalysis | null;
  tags?: Record<string, string> | null;
  forkOf?: { skillId: string; kind: string; version?: string | null } | null;
  canonicalSkillId?: string | null;
  syncedAt?: string;
  detailSyncedAt?: string | null;
};

export type ClawHubSortField = "downloads" | "stars" | "installs" | "updated" | "newest" | "name";
export type ClawHubSortDir = "asc" | "desc";

export type UseClawHubSkillsResult = {
  skills: ClawHubSkillItem[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  hideSuspicious: boolean;
  setHideSuspicious: (value: boolean) => void;
  sortField: ClawHubSortField;
  setSortField: (field: ClawHubSortField) => void;
  sortDir: ClawHubSortDir;
  setSortDir: (dir: ClawHubSortDir) => void;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
  loadSkillDetail: (slug: string) => Promise<ClawHubSkillPackageDetail>;
  loadSkillFile: (slug: string, path: string) => Promise<string>;
};

const DEBOUNCE_MS = 350;
const PAGE_SIZE = 25;

export function useClawHubSkills(initial?: {
  query?: string;
  sort?: ClawHubSortField;
  hideSuspicious?: boolean;
}): UseClawHubSkillsResult {
  const [skills, setSkills] = React.useState<ClawHubSkillItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState(initial?.query ?? "");
  const [hideSuspicious, setHideSuspicious] = React.useState(initial?.hideSuspicious ?? true);
  const [sortField, setSortField] = React.useState<ClawHubSortField>(initial?.sort ?? "downloads");
  const [sortDir, setSortDir] = React.useState<ClawHubSortDir>("desc");
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(0);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasMore = page < totalPages;

  const refresh = React.useCallback(() => {
    setPage(1);
    setRefreshKey((k) => k + 1);
  }, []);

  React.useEffect(() => {
    setPage(1);
  }, [searchQuery, hideSuspicious, sortField, sortDir]);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const isFirstPage = page === 1;
      if (isFirstPage) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const api = getDesktopApi();
        const query = searchQuery.trim();

        const result = await api.clawhubListSkills({
          q: query || undefined,
          page,
          limit: PAGE_SIZE,
          sort: sortField,
          dir: sortDir,
          nonSuspicious: hideSuspicious,
        });
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error ?? "Failed to load skills");
          if (isFirstPage) setSkills([]);
          setTotalPages(0);
          return;
        }
        setTotalPages(result.totalPages);
        if (isFirstPage) {
          setSkills(result.items as ClawHubSkillItem[]);
        } else {
          setSkills((prev) => [...prev, ...(result.items as ClawHubSkillItem[])]);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        if (page === 1) setSkills([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    };

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (searchQuery.trim()) {
      debounceRef.current = setTimeout(() => void load(), DEBOUNCE_MS);
    } else {
      void load();
    }

    return () => {
      cancelled = true;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [hideSuspicious, searchQuery, sortField, sortDir, page, refreshKey]);

  const loadMore = React.useCallback(() => {
    if (hasMore && !loading && !loadingMore) {
      setPage((p) => p + 1);
    }
  }, [hasMore, loading, loadingMore]);

  const loadSkillDetail = React.useCallback(async (slug: string) => {
    const api = getDesktopApi();
    const result = await api.clawhubGetSkillPackage({ slug });
    if (!result.ok || !result.package) {
      throw new Error(result.error ?? `Failed to load "${slug}"`);
    }
    return result.package as ClawHubSkillPackageDetail;
  }, []);

  const loadSkillFile = React.useCallback(async (slug: string, path: string) => {
    const api = getDesktopApi();
    const result = await api.clawhubGetSkillFile({ slug, path });
    if (!result.ok || !result.content) {
      throw new Error(result.error ?? `Failed to load file "${path}" for "${slug}"`);
    }
    return result.content;
  }, []);

  return {
    skills,
    loading,
    loadingMore,
    error,
    searchQuery,
    setSearchQuery,
    hideSuspicious,
    setHideSuspicious,
    sortField,
    setSortField,
    sortDir,
    setSortDir,
    hasMore,
    loadMore,
    refresh,
    loadSkillDetail,
    loadSkillFile,
  };
}
