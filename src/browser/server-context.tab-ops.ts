import { CDP_JSON_NEW_TIMEOUT_MS } from "./cdp-timeouts.js";
import { fetchJson, fetchOk, normalizeCdpHttpBaseForJsonEndpoints } from "./cdp.helpers.js";
import { appendCdpPath, createTargetViaCdp, normalizeCdpWsUrl } from "./cdp.js";
import { listChromeMcpTabs, openChromeMcpTab } from "./chrome-mcp.js";
import type { ResolvedBrowserProfile } from "./config.js";
import { BrowserProfileUnavailableError } from "./errors.js";
import {
  assertBrowserNavigationAllowed,
  assertBrowserNavigationResultAllowed,
  InvalidBrowserNavigationUrlError,
  requiresInspectableBrowserNavigationRedirects,
  withBrowserNavigationPolicy,
} from "./navigation-guard.js";
import { getBrowserProfileCapabilities } from "./profile-capabilities.js";
import type { PwAiModule } from "./pw-ai-module.js";
import { getPwAiModule } from "./pw-ai-module.js";
import {
  MANAGED_BROWSER_PAGE_TAB_LIMIT,
  OPEN_TAB_DISCOVERY_POLL_MS,
  OPEN_TAB_DISCOVERY_WINDOW_MS,
} from "./server-context.constants.js";
import type {
  BrowserServerState,
  BrowserTab,
  ProfileRuntimeState,
} from "./server-context.types.js";

type TabOpsDeps = {
  profile: ResolvedBrowserProfile;
  state: () => BrowserServerState;
  getProfileState: () => ProfileRuntimeState;
};

type ProfileTabOps = {
  listTabs: () => Promise<BrowserTab[]>;
  openTab: (url: string) => Promise<BrowserTab>;
};

/**
 * Normalize a CDP WebSocket URL to use the correct base URL.
 */
function normalizeWsUrl(raw: string | undefined, cdpBaseUrl: string): string | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    return normalizeCdpWsUrl(raw, cdpBaseUrl);
  } catch {
    return raw;
  }
}

type CdpTarget = {
  id?: string;
  title?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
  type?: string;
};

function describeError(err: unknown): string {
  if (err == null) {
    return "";
  }
  if (err instanceof Error) {
    return err.message || err.name;
  }
  if (typeof err === "string") {
    return err;
  }
  if (typeof err === "number" || typeof err === "boolean" || typeof err === "bigint") {
    return String(err);
  }
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

/**
 * Compare two candidate tab URLs for the "did openTab land on this tab?"
 * heuristic. Tolerates the tiny normalizations that browsers apply to an
 * address-bar URL (trailing slash, omitted default path, http → https after
 * redirect) without matching loosely-related pages.
 */
function urlMatchesOpenedUrl(tabUrl: string | undefined, requestedUrl: string): boolean {
  if (!tabUrl) {
    return false;
  }
  if (tabUrl === requestedUrl) {
    return true;
  }
  const normalize = (value: string): string | null => {
    try {
      const u = new URL(value);
      const pathname = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
      return `${u.host.toLowerCase()}${pathname}${u.search}`;
    } catch {
      return null;
    }
  };
  const a = normalize(tabUrl);
  const b = normalize(requestedUrl);
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  // Requested "https://site.tld" should match landed "https://site.tld/news"
  // only if the landed URL starts with the requested host (common redirect to
  // the same origin's default page). We intentionally stay strict on the host
  // and the leading path segment to avoid false positives.
  if (a.startsWith(b + "/")) {
    return true;
  }
  return false;
}

/**
 * Find page tabs whose URL is a plausible match for a just-opened URL.
 * Filters out tabs that already existed before openTab started so we do not
 * accidentally grab an unrelated pre-existing tab that happens to share the
 * URL with what we just opened.
 */
function findTabsMatchingOpenUrl<T extends { targetId: string; url?: string; type?: string }>(
  tabs: T[],
  requestedUrl: string,
  preExistingTargetIds: Set<string>,
): T[] {
  return tabs.filter((tab) => {
    if ((tab.type ?? "page") !== "page") {
      return false;
    }
    if (preExistingTargetIds.has(tab.targetId)) {
      return false;
    }
    return urlMatchesOpenedUrl(tab.url, requestedUrl);
  });
}

/**
 * The HTTP `PUT /json/new` fallback is a last resort when the WebSocket
 * `Target.createTarget` path cannot create a tab. When it also fails (most
 * commonly with `HTTP 404` from the Sigma extension relay, which does not
 * implement `/json/new`), surface a single human-friendly error that explains
 * the likely cause instead of the bare `HTTP 404`.
 */
function wrapOpenTabFallbackError(args: {
  err: unknown;
  cdpUrl: string;
  profileName: string;
  cdpCreateError: unknown;
}): BrowserProfileUnavailableError {
  const fallback = describeError(args.err);
  const cdp = describeError(args.cdpCreateError);
  const looksLike404 = fallback.includes("HTTP 404") || /404/.test(fallback);
  const headline = looksLike404
    ? `cannot open a new tab in profile "${args.profileName}": the browser at ${args.cdpUrl} did not accept the request`
    : `cannot open a new tab in profile "${args.profileName}" (${args.cdpUrl}): ${fallback}`;
  const hint =
    "open or focus a tab in the target browser and ensure the Sigma extension (or the underlying Chromium DevTools) is connected, then retry";
  const details = cdp ? ` [cdp: ${cdp}; fallback: ${fallback}]` : ` [fallback: ${fallback}]`;
  return new BrowserProfileUnavailableError(`${headline} — ${hint}${details}`, {
    cause: args.err instanceof Error ? args.err : undefined,
  });
}

export function createProfileTabOps({
  profile,
  state,
  getProfileState,
}: TabOpsDeps): ProfileTabOps {
  const cdpHttpBase = normalizeCdpHttpBaseForJsonEndpoints(profile.cdpUrl);
  const capabilities = getBrowserProfileCapabilities(profile);

  const listTabs = async (): Promise<BrowserTab[]> => {
    if (capabilities.usesChromeMcp) {
      return await listChromeMcpTabs(profile.name);
    }

    if (capabilities.usesPersistentPlaywright) {
      const mod = await getPwAiModule({ mode: "strict" });
      const listPagesViaPlaywright = (mod as Partial<PwAiModule> | null)?.listPagesViaPlaywright;
      if (typeof listPagesViaPlaywright === "function") {
        const pages = await listPagesViaPlaywright({ cdpUrl: profile.cdpUrl });
        return pages.map((p) => ({
          targetId: p.targetId,
          title: p.title,
          url: p.url,
          type: p.type,
        }));
      }
    }

    const raw = await fetchJson<
      Array<{
        id?: string;
        title?: string;
        url?: string;
        webSocketDebuggerUrl?: string;
        type?: string;
      }>
    >(appendCdpPath(cdpHttpBase, "/json/list"));
    return raw
      .map((t) => ({
        targetId: t.id ?? "",
        title: t.title ?? "",
        url: t.url ?? "",
        wsUrl: normalizeWsUrl(t.webSocketDebuggerUrl, profile.cdpUrl),
        type: t.type,
      }))
      .filter((t) => Boolean(t.targetId));
  };

  const enforceManagedTabLimit = async (keepTargetId: string): Promise<void> => {
    const profileState = getProfileState();
    if (
      !capabilities.supportsManagedTabLimit ||
      state().resolved.attachOnly ||
      !profileState.running
    ) {
      return;
    }

    const pageTabs = await listTabs()
      .then((tabs) => tabs.filter((tab) => (tab.type ?? "page") === "page"))
      .catch(() => [] as BrowserTab[]);
    if (pageTabs.length <= MANAGED_BROWSER_PAGE_TAB_LIMIT) {
      return;
    }

    const candidates = pageTabs.filter((tab) => tab.targetId !== keepTargetId);
    const excessCount = pageTabs.length - MANAGED_BROWSER_PAGE_TAB_LIMIT;
    for (const tab of candidates.slice(0, excessCount)) {
      void fetchOk(appendCdpPath(cdpHttpBase, `/json/close/${tab.targetId}`)).catch(() => {
        // best-effort cleanup only
      });
    }
  };

  const triggerManagedTabLimit = (keepTargetId: string): void => {
    void enforceManagedTabLimit(keepTargetId).catch(() => {
      // best-effort cleanup only
    });
  };

  const openTab = async (url: string): Promise<BrowserTab> => {
    const ssrfPolicyOpts = withBrowserNavigationPolicy(state().resolved.ssrfPolicy);

    if (capabilities.usesChromeMcp) {
      await assertBrowserNavigationAllowed({ url, ...ssrfPolicyOpts });
      const page = await openChromeMcpTab(profile.name, url);
      const profileState = getProfileState();
      profileState.lastTargetId = page.targetId;
      await assertBrowserNavigationResultAllowed({ url: page.url, ...ssrfPolicyOpts });
      return page;
    }

    if (capabilities.usesPersistentPlaywright) {
      const mod = await getPwAiModule({ mode: "strict" });
      const createPageViaPlaywright = (mod as Partial<PwAiModule> | null)?.createPageViaPlaywright;
      if (typeof createPageViaPlaywright === "function") {
        const page = await createPageViaPlaywright({
          cdpUrl: profile.cdpUrl,
          url,
          ...ssrfPolicyOpts,
        });
        const profileState = getProfileState();
        profileState.lastTargetId = page.targetId;
        triggerManagedTabLimit(page.targetId);
        return {
          targetId: page.targetId,
          title: page.title,
          url: page.url,
          type: page.type,
        };
      }
    }

    if (requiresInspectableBrowserNavigationRedirects(state().resolved.ssrfPolicy)) {
      throw new InvalidBrowserNavigationUrlError(
        "Navigation blocked: strict browser SSRF policy requires Playwright-backed redirect-hop inspection",
      );
    }

    let cdpCreateError: unknown = null;
    const createdViaCdp = await createTargetViaCdp({
      cdpUrl: profile.cdpUrl,
      url,
      ...ssrfPolicyOpts,
    })
      .then((r) => r.targetId)
      .catch((err) => {
        cdpCreateError = err;
        return null;
      });

    if (createdViaCdp) {
      const profileState = getProfileState();
      profileState.lastTargetId = createdViaCdp;
      const deadline = Date.now() + OPEN_TAB_DISCOVERY_WINDOW_MS;
      let lastTabs: BrowserTab[] = [];
      // Tabs observed before we started openTab — these cannot be the newly
      // created one, even if their URL matches (e.g. user already had the
      // target URL open in another tab). We record them once and exclude them
      // from the URL-based fallback.
      const preExistingTargetIds = new Set(
        await listTabs()
          .then((tabs) => tabs.map((t) => t.targetId))
          .catch(() => [] as string[]),
      );
      while (Date.now() < deadline) {
        const tabs = await listTabs().catch(() => [] as BrowserTab[]);
        lastTabs = tabs;
        const found = tabs.find((t) => t.targetId === createdViaCdp);
        if (found) {
          await assertBrowserNavigationResultAllowed({ url: found.url, ...ssrfPolicyOpts });
          triggerManagedTabLimit(found.targetId);
          return found;
        }
        await new Promise((r) => setTimeout(r, OPEN_TAB_DISCOVERY_POLL_MS));
      }
      // Fallback for drivers (e.g. Sigma extension-relay) that return a
      // targetId from Target.createTarget which does not match the id later
      // reported by /json/list. In that case we locate the newly created tab
      // by URL — preferring tabs that did not exist before openTab began.
      // This prevents a stream of "tab not found" errors on subsequent
      // snapshot/act/navigate calls that re-use the returned targetId.
      const urlMatches = findTabsMatchingOpenUrl(lastTabs, url, preExistingTargetIds);
      if (urlMatches.length > 0) {
        const fallback = urlMatches[urlMatches.length - 1];
        profileState.lastTargetId = fallback.targetId;
        await assertBrowserNavigationResultAllowed({ url: fallback.url, ...ssrfPolicyOpts });
        triggerManagedTabLimit(fallback.targetId);
        return fallback;
      }
      triggerManagedTabLimit(createdViaCdp);
      return { targetId: createdViaCdp, title: "", url, type: "page" };
    }

    const encoded = encodeURIComponent(url);
    const endpointUrl = new URL(appendCdpPath(cdpHttpBase, "/json/new"));
    await assertBrowserNavigationAllowed({ url, ...ssrfPolicyOpts });
    const endpoint = endpointUrl.search
      ? (() => {
          endpointUrl.searchParams.set("url", url);
          return endpointUrl.toString();
        })()
      : `${endpointUrl.toString()}?${encoded}`;
    const created = await fetchJson<CdpTarget>(endpoint, CDP_JSON_NEW_TIMEOUT_MS, {
      method: "PUT",
    })
      .catch(async (err) => {
        if (String(err).includes("HTTP 405")) {
          return await fetchJson<CdpTarget>(endpoint, CDP_JSON_NEW_TIMEOUT_MS);
        }
        throw err;
      })
      .catch((err) => {
        throw wrapOpenTabFallbackError({
          err,
          cdpUrl: profile.cdpUrl,
          profileName: profile.name,
          cdpCreateError,
        });
      });

    if (!created.id) {
      throw new Error("Failed to open tab (missing id)");
    }
    const profileState = getProfileState();
    profileState.lastTargetId = created.id;
    const resolvedUrl = created.url ?? url;
    await assertBrowserNavigationResultAllowed({ url: resolvedUrl, ...ssrfPolicyOpts });
    triggerManagedTabLimit(created.id);
    return {
      targetId: created.id,
      title: created.title ?? "",
      url: resolvedUrl,
      wsUrl: normalizeWsUrl(created.webSocketDebuggerUrl, profile.cdpUrl),
      type: created.type,
    };
  };

  return {
    listTabs,
    openTab,
  };
}
