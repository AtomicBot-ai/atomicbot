import React from "react";

type GatewayRpc = {
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>;
};

type ConfigSnapshotLike = {
  path?: string;
  exists?: boolean;
  valid?: boolean;
  hash?: string;
  config?: unknown;
};

export type SkillId =
  | "google-workspace"
  | "media-understanding"
  | "web-search"
  | "notion"
  | "trello"
  | "apple-notes"
  | "apple-reminders"
  | "obsidian"
  | "github"
  | "slack"
  | "gemini"
  | "nano-banana"
  | "sag";

export type SkillStatus = "connect" | "connected" | "disabled" | "coming-soon";

function getObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

/** Resolve a skill entry's status: connected, disabled, or connect (not configured). */
function resolveSkillEntryStatus(config: Record<string, unknown>, skillKey: string): SkillStatus {
  const skills = getObject(config.skills);
  const entries = getObject(skills.entries);
  const entry = getObject(entries[skillKey]);
  // Entry exists and is explicitly disabled.
  if (entry.enabled === false) {return "disabled";}
  // Entry exists and is enabled.
  if (entry.enabled === true) {return "connected";}
  return "connect";
}

/** Derive skill statuses from the openclaw config snapshot. */
function deriveStatusFromConfig(config: unknown): Record<SkillId, SkillStatus> {
  const cfg = getObject(config);
  const tools = getObject(cfg.tools);
  const media = getObject(tools.media);
  const image = getObject(media.image);
  const audio = getObject(media.audio);
  const web = getObject(tools.web);
  const search = getObject(web.search);
  const channels = getObject(cfg.channels);
  const slackChannel = getObject(channels.slack);

  // Media: connected if any capability is on, disabled if search.enabled is explicitly false.
  const mediaConnected = image.enabled === true || audio.enabled === true;
  const mediaDisabled =
    image.enabled === false &&
    audio.enabled === false &&
    ("enabled" in image || "enabled" in audio);
  const mediaStatus: SkillStatus = mediaConnected
    ? "connected"
    : mediaDisabled
      ? "disabled"
      : "connect";

  // Web search: check enabled flag and provider presence.
  const webSearchConnected =
    (typeof search.provider === "string" && search.provider.trim().length > 0) ||
    search.enabled === true;
  const webSearchDisabled = search.enabled === false && "enabled" in search;
  const webSearchStatus: SkillStatus = webSearchConnected
    ? "connected"
    : webSearchDisabled
      ? "disabled"
      : "connect";

  // Slack: check channel config or skill entry.
  const slackChannelEnabled = slackChannel.enabled === true;
  const slackChannelDisabled = slackChannel.enabled === false && "enabled" in slackChannel;
  const slackSkillStatus = resolveSkillEntryStatus(cfg, "slack");
  const slackStatus: SkillStatus =
    slackChannelEnabled || slackSkillStatus === "connected"
      ? "connected"
      : slackChannelDisabled || slackSkillStatus === "disabled"
        ? "disabled"
        : "connect";

  return {
    "google-workspace": "connect", // detected separately via gogAuthList
    "media-understanding": mediaStatus,
    "web-search": webSearchStatus,
    notion: resolveSkillEntryStatus(cfg, "notion"),
    trello: resolveSkillEntryStatus(cfg, "trello"),
    "apple-notes": resolveSkillEntryStatus(cfg, "apple-notes"),
    "apple-reminders": resolveSkillEntryStatus(cfg, "apple-reminders"),
    obsidian: resolveSkillEntryStatus(cfg, "obsidian"),
    github: resolveSkillEntryStatus(cfg, "github"),
    slack: slackStatus,
    gemini: "coming-soon",
    "nano-banana": resolveSkillEntryStatus(cfg, "nano-banana-pro"),
    sag: "coming-soon",
  };
}

/** Map skill IDs to the appropriate disable mechanism. */
const SKILLS_ENTRY_KEYS: Partial<Record<SkillId, string>> = {
  notion: "notion",
  trello: "trello",
  "apple-notes": "apple-notes",
  "apple-reminders": "apple-reminders",
  obsidian: "obsidian",
  github: "github",
  "google-workspace": "gog",
  "nano-banana": "nano-banana-pro",
};

export async function disableSkill(
  gw: GatewayRpc,
  loadConfig: () => Promise<ConfigSnapshotLike>,
  skillId: SkillId
): Promise<void> {
  const entryKey = SKILLS_ENTRY_KEYS[skillId];
  if (entryKey) {
    // Skills-based disable via skills.update.
    await gw.request("skills.update", { skillKey: entryKey, enabled: false });
    return;
  }

  // Tools/channels-based disable via config.patch.
  const snap = await loadConfig();
  const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
  if (!baseHash) {
    throw new Error("Config base hash missing. Reload and try again.");
  }

  if (skillId === "media-understanding") {
    await gw.request("config.patch", {
      baseHash,
      raw: JSON.stringify({
        tools: {
          media: {
            image: { enabled: false },
            audio: { enabled: false },
            video: { enabled: false },
          },
        },
      }),
      note: "Settings: disable media understanding",
    });
  } else if (skillId === "web-search") {
    await gw.request("config.patch", {
      baseHash,
      raw: JSON.stringify({ tools: { web: { search: { enabled: false } } } }),
      note: "Settings: disable web search",
    });
  } else if (skillId === "slack") {
    await gw.request("config.patch", {
      baseHash,
      raw: JSON.stringify({ channels: { slack: { enabled: false } } }),
      note: "Settings: disable Slack",
    });
  }
}

export function useSkillsStatus(props: {
  gw: GatewayRpc;
  configSnap: ConfigSnapshotLike | null;
  reload: () => Promise<void>;
}) {
  const { gw, configSnap, reload } = props;
  const [statuses, setStatuses] = React.useState<Record<SkillId, SkillStatus>>(() =>
    deriveStatusFromConfig(configSnap?.config)
  );
  const [loading, setLoading] = React.useState(true);

  // Re-derive config-based statuses whenever configSnap changes.
  React.useEffect(() => {
    if (!configSnap) {return;}
    setStatuses((prev) => {
      const next = deriveStatusFromConfig(configSnap.config);
      // Preserve Google Workspace status from async gogAuthList check.
      next["google-workspace"] = prev["google-workspace"];
      return next;
    });
  }, [configSnap]);

  // Check Google Workspace auth status on mount.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const api = window.openclawDesktop;
        if (!api) {return;}
        const res = await api.gogAuthList();
        if (cancelled) {return;}
        const connected = res.ok && typeof res.stdout === "string" && res.stdout.trim().length > 0;
        setStatuses((prev) => ({
          ...prev,
          "google-workspace": connected ? "connected" : "connect",
        }));
      } catch {
        // Best-effort; leave as "connect".
      } finally {
        if (!cancelled) {setLoading(false);}
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Mark a single skill as connected after a successful setup. */
  const markConnected = React.useCallback((skillId: SkillId) => {
    setStatuses((prev) => {
      if (prev[skillId] === "connected") {return prev;}
      return { ...prev, [skillId]: "connected" };
    });
  }, []);

  /** Mark a single skill as disabled. */
  const markDisabled = React.useCallback((skillId: SkillId) => {
    setStatuses((prev) => {
      if (prev[skillId] === "disabled") {return prev;}
      return { ...prev, [skillId]: "disabled" };
    });
  }, []);

  /** Refresh statuses from config (re-read config + re-check gog). */
  const refresh = React.useCallback(async () => {
    await reload();
  }, [reload]);

  /** Provide a loadConfig helper compatible with onboarding hooks. */
  const loadConfig = React.useCallback(async () => {
    return await gw.request<ConfigSnapshotLike>("config.get", {});
  }, [gw]);

  return { statuses, loading, markConnected, markDisabled, refresh, loadConfig };
}
