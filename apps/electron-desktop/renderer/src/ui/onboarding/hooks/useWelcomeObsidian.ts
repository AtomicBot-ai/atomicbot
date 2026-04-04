import React from "react";
import { getDesktopApi } from "@ipc/desktopApi";
import { errorToMessage } from "@shared/toast";
import type { AsyncRunner, ConfigSnapshot, GatewayRpcLike, SkillId } from "./types";
import { getObject, getStringArray, unique } from "./onboarding-config-helpers";

type UseWelcomeObsidianInput = {
  gw: GatewayRpcLike;
  loadConfig: () => Promise<ConfigSnapshot>;
  setError: (value: string | null) => void;
  setStatus: (value: string | null) => void;
  run: AsyncRunner;
  markSkillConnected: (skillId: SkillId) => void;
  goSkills: () => void;
  goObsidianPage: () => void;
};

export type ObsidianVault = {
  name: string;
  path: string;
  open: boolean;
};

type ExecApprovalsAllowlistEntry = {
  id?: string;
  pattern: string;
  lastUsedAt?: number;
  lastUsedCommand?: string;
  lastResolvedPath?: string;
};

type ExecApprovalsFile = {
  version: 1;
  socket?: { path?: string; token?: string };
  defaults?: {
    security?: string;
    ask?: string;
    askFallback?: string;
    autoAllowSkills?: boolean;
  };
  agents?: Record<
    string,
    {
      security?: string;
      ask?: string;
      askFallback?: string;
      autoAllowSkills?: boolean;
      allowlist?: ExecApprovalsAllowlistEntry[];
    }
  >;
};

type ExecApprovalsSnapshot = {
  path: string;
  exists: boolean;
  hash: string;
  file: ExecApprovalsFile;
};

function mergeAllowlistEntries(
  existing: ExecApprovalsAllowlistEntry[] | undefined,
  patterns: string[]
): ExecApprovalsAllowlistEntry[] {
  const list = Array.isArray(existing) ? existing : [];
  const seen = new Set(list.map((e) => e.pattern.trim().toLowerCase()).filter(Boolean));
  const next = [...list];
  for (const pattern of patterns) {
    const normalized = pattern.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    next.push({ pattern });
  }
  return next;
}

export function useWelcomeObsidian({
  gw,
  loadConfig,
  setError,
  setStatus,
  run,
  markSkillConnected,
  goSkills,
  goObsidianPage,
}: UseWelcomeObsidianInput) {
  // Vault state (moved from useWelcomeState)
  const [obsidianVaultsLoading, setObsidianVaultsLoading] = React.useState(false);
  const [obsidianVaults, setObsidianVaults] = React.useState<ObsidianVault[]>([]);
  const [selectedObsidianVaultName, setSelectedObsidianVaultName] = React.useState("");

  const enableObsidian = React.useCallback(
    async (params?: { obsidianCliResolvedPath?: string | null }): Promise<boolean> => {
      setError(null);
      setStatus("Enabling Obsidian skill…");

      const snap = await loadConfig();
      const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
      if (!baseHash) {
        throw new Error("Config base hash missing. Reload and try again.");
      }

      const cfg = getObject(snap.config);
      const tools = getObject(cfg.tools);
      const exec = getObject(tools.exec);
      const existingSafeBins = getStringArray(exec.safeBins);
      // `head` is commonly used for piping/previewing output without introducing file-path args.
      const safeBins = unique(
        [...existingSafeBins, "obsidian-cli", "which", "head"].map((v) => v.toLowerCase())
      );

      const hostRaw = typeof exec.host === "string" ? exec.host.trim() : "";
      // Obsidian uses a bundled binary that is guaranteed on the gateway host PATH. In sandbox
      // mode it may not resolve, causing repeated exec approvals. Prefer host=gateway.
      const host = !hostRaw || hostRaw === "sandbox" ? "gateway" : hostRaw;
      const securityRaw = typeof exec.security === "string" ? exec.security.trim() : "";
      const security = securityRaw || "allowlist";
      const askRaw = typeof exec.ask === "string" ? exec.ask.trim() : "";
      const ask = askRaw || "on-miss";

      await gw.request("config.patch", {
        baseHash,
        raw: JSON.stringify(
          {
            skills: {
              entries: {
                obsidian: {
                  enabled: true,
                },
              },
            },
            tools: {
              exec: {
                host,
                security,
                ask,
                safeBins,
              },
            },
          },
          null,
          2
        ),
        note: "Welcome: enable Obsidian (obsidian-cli) skill",
      });

      try {
        setStatus("Allowing obsidian-cli (exec approvals)…");
        const approvals = await gw.request<ExecApprovalsSnapshot>("exec.approvals.get", {});
        const file = approvals.file ?? { version: 1 };
        const agents = file.agents ?? {};

        const resolvedPath =
          typeof params?.obsidianCliResolvedPath === "string" &&
          params.obsidianCliResolvedPath.trim()
            ? params.obsidianCliResolvedPath.trim()
            : null;
        const patterns = resolvedPath
          ? ["**/obsidian-cli", "**/which", resolvedPath]
          : ["**/obsidian-cli", "**/which"];

        // Apply both to "*" (wildcard) and "main" to avoid mismatches when the active agent id
        // differs from our onboarding assumption.
        const wildcard = agents["*"] ?? {};
        const wildcardAllowlist = mergeAllowlistEntries(wildcard.allowlist, patterns);

        const agentId = "main";
        const agent = agents[agentId] ?? {};
        const allowlist = mergeAllowlistEntries(agent.allowlist, patterns);

        const nextFile: ExecApprovalsFile = {
          ...file,
          version: 1,
          agents: {
            ...agents,
            "*": {
              ...wildcard,
              allowlist: wildcardAllowlist,
            },
            [agentId]: {
              ...agent,
              allowlist,
            },
          },
        };
        await gw.request("exec.approvals.set", {
          baseHash: approvals.hash,
          file: nextFile,
        });
      } catch (err) {
        // Best-effort: skill enablement is already saved; don't block onboarding.
        void err;
      }

      setStatus("Obsidian enabled.");
      return true;
    },
    [gw, loadConfig, setError, setStatus]
  );

  /** Fetch the list of Obsidian vaults via the desktop API. */
  const refreshObsidianVaults = React.useCallback(async (): Promise<void> => {
    const api = getDesktopApi();
    setObsidianVaultsLoading(true);
    try {
      const res = await api.obsidianVaultsList();
      if (!res.ok) {
        const stderr = res.stderr?.trim();
        const stdout = res.stdout?.trim();
        throw new Error(stderr || stdout || "failed to list Obsidian vaults");
      }
      const parsed = JSON.parse(res.stdout || "[]") as unknown;
      const list: ObsidianVault[] = Array.isArray(parsed)
        ? parsed
            .map((v) => {
              if (!v || typeof v !== "object" || Array.isArray(v)) {
                return null;
              }
              const o = v as { name?: unknown; path?: unknown; open?: unknown };
              const name = typeof o.name === "string" ? o.name : "";
              const vaultPath = typeof o.path === "string" ? o.path : "";
              const open = o.open === true;
              if (!name || !vaultPath) {
                return null;
              }
              return { name, path: vaultPath, open };
            })
            .filter((v): v is ObsidianVault => Boolean(v))
        : [];
      setObsidianVaults(list);
      // Prefer the currently-open vault (Obsidian app), otherwise keep user selection, otherwise pick the first.
      const openVault = list.find((v) => v.open);
      setSelectedObsidianVaultName((prev) => prev || openVault?.name || list[0]?.name || "");
    } finally {
      setObsidianVaultsLoading(false);
    }
  }, []);

  /** Navigate to the Obsidian page after pre-loading vaults. */
  const goObsidian = React.useCallback(() => {
    setError(null);
    setStatus("Loading Obsidian vaults…");
    void (async () => {
      try {
        await refreshObsidianVaults();
        setStatus(null);
        goObsidianPage();
      } catch (err) {
        setError(errorToMessage(err));
        setStatus(null);
      }
    })();
  }, [goObsidianPage, refreshObsidianVaults, setError, setStatus]);

  /** Check obsidian-cli, enable the skill, and verify the default vault. */
  const onObsidianRecheck = React.useCallback(async () => {
    setStatus("Checking obsidian-cli…");
    await run(async () => {
      const api = getDesktopApi();

      const checkRes = await api.obsidianCliCheck();
      if (!checkRes.ok) {
        const stderr = checkRes.stderr?.trim();
        const stdout = checkRes.stdout?.trim();
        throw new Error(stderr || stdout || "obsidian-cli check failed");
      }

      // Enable skill + allowlist regardless of default vault state.
      await enableObsidian({ obsidianCliResolvedPath: checkRes.resolvedPath });

      setStatus("Checking default vault…");
      const defaultRes = await api.obsidianCliPrintDefaultPath();
      if (defaultRes.ok) {
        markSkillConnected("obsidian");
        goSkills();
        return;
      }

      // Keep the skill enabled, but don't mark as connected until default vault is set.
      setStatus('Obsidian enabled. Set a default vault, then click "Check & enable" again.');
    });
  }, [run, enableObsidian, goSkills, markSkillConnected, setStatus]);

  /** Set the default vault, enable the skill, and verify. */
  const onObsidianSetDefaultAndEnable = React.useCallback(
    async (vaultName: string) => {
      setStatus("Checking obsidian-cli…");
      await run(async () => {
        const api = getDesktopApi();

        const checkRes = await api.obsidianCliCheck();
        if (!checkRes.ok) {
          const stderr = checkRes.stderr?.trim();
          const stdout = checkRes.stdout?.trim();
          throw new Error(stderr || stdout || "obsidian-cli check failed");
        }

        setStatus("Setting default vault…");
        const setRes = await api.obsidianCliSetDefault({ vaultName });
        if (!setRes.ok) {
          const stderr = setRes.stderr?.trim();
          const stdout = setRes.stdout?.trim();
          throw new Error(stderr || stdout || "failed to set default vault");
        }

        // Enable skill + allowlist with the resolved path we actually run.
        const resolvedPath = checkRes.resolvedPath ?? setRes.resolvedPath ?? null;
        await enableObsidian({ obsidianCliResolvedPath: resolvedPath });

        setStatus("Checking default vault…");
        const defaultRes = await api.obsidianCliPrintDefaultPath();
        if (!defaultRes.ok) {
          const stderr = defaultRes.stderr?.trim();
          const stdout = defaultRes.stdout?.trim();
          throw new Error(stderr || stdout || "default vault check failed");
        }

        markSkillConnected("obsidian");
        goSkills();
      });
    },
    [run, enableObsidian, goSkills, markSkillConnected, setStatus]
  );

  return {
    enableObsidian,
    goObsidian,
    obsidianVaults,
    obsidianVaultsLoading,
    onObsidianRecheck,
    onObsidianSetDefaultAndEnable,
    refreshObsidianVaults,
    selectedObsidianVaultName,
    setSelectedObsidianVaultName,
  };
}
