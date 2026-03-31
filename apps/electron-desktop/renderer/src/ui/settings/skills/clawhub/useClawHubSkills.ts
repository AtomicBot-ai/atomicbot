import React from "react";
import { getDesktopApi } from "@ipc/desktopApi";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { skillsActions } from "@store/slices/skillsSlice";

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

function buildFetchKey(q: string, sort: ClawHubSortField, dir: ClawHubSortDir, safe: boolean) {
  return `${q.trim()}|${sort}|${dir}|${safe}`;
}

export function useClawHubSkills(initial?: {
  query?: string;
  sort?: ClawHubSortField;
  hideSuspicious?: boolean;
}): UseClawHubSkillsResult {
  const dispatch = useAppDispatch();
  const cachedClawhub = useAppSelector((s) => s.skills.clawhub);

  const initialQuery = initial?.query ?? "";
  const initialSort = initial?.sort ?? "downloads";
  const initialSafe = initial?.hideSuspicious ?? true;
  const initialFetchKey = buildFetchKey(initialQuery, initialSort, "desc", initialSafe);
  const hasCachedData =
    cachedClawhub.items.length > 0 && cachedClawhub.lastFetchKey === initialFetchKey;

  const [skills, setSkills] = React.useState<ClawHubSkillItem[]>(
    hasCachedData ? cachedClawhub.items : []
  );
  const [loading, setLoading] = React.useState(!hasCachedData);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState(initialQuery);
  const [hideSuspicious, setHideSuspicious] = React.useState(initialSafe);
  const [sortField, setSortField] = React.useState<ClawHubSortField>(initialSort);
  const [sortDir, setSortDir] = React.useState<ClawHubSortDir>("desc");
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(hasCachedData ? cachedClawhub.totalPages : 0);
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
      if (isFirstPage && skills.length === 0) {
        setLoading(true);
      } else if (!isFirstPage) {
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
        const fetchedItems = result.items as ClawHubSkillItem[];
        setTotalPages(result.totalPages);
        if (isFirstPage) {
          setSkills(fetchedItems);
          const fetchKey = buildFetchKey(query, sortField, sortDir, hideSuspicious);
          dispatch(
            skillsActions.setClawHubSkills({
              items: fetchedItems,
              totalPages: result.totalPages,
              fetchKey,
            })
          );
        } else {
          setSkills((prev) => {
            const merged = [...prev, ...fetchedItems];
            dispatch(
              skillsActions.appendClawHubSkills({
                items: fetchedItems,
                totalPages: result.totalPages,
              })
            );
            return merged;
          });
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
  }, [dispatch, hideSuspicious, searchQuery, sortField, sortDir, page, refreshKey]);

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
