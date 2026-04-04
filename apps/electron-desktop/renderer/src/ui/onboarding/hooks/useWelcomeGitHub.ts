import React from "react";
import { getDesktopApi } from "@ipc/desktopApi";
import type { AsyncRunner, ConfigSnapshot, GatewayRpcLike, SkillId } from "./types";
import { getObject, getStringArray, unique } from "./onboarding-config-helpers";

type UseWelcomeGitHubInput = {
  gw: GatewayRpcLike;
  loadConfig: () => Promise<ConfigSnapshot>;
  setError: (value: string | null) => void;
  setStatus: (value: string | null) => void;
  run: AsyncRunner;
  markSkillConnected: (skillId: SkillId) => void;
  goSkills: () => void;
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

export function useWelcomeGitHub({
  gw,
  loadConfig,
  setError,
  setStatus,
  run,
  markSkillConnected,
  goSkills,
}: UseWelcomeGitHubInput) {
  const enableGitHub = React.useCallback(
    async (params?: { ghResolvedPath?: string | null }): Promise<boolean> => {
      setError(null);
      setStatus("Enabling GitHub skill…");

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
        [...existingSafeBins, "gh", "which", "head"].map((v) => v.toLowerCase())
      );

      const hostRaw = typeof exec.host === "string" ? exec.host.trim() : "";
      // GitHub CLI is bundled and available on the gateway host PATH. Prefer host=gateway.
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
                github: {
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
        note: "Welcome: enable GitHub (gh) skill",
      });

      try {
        setStatus("Allowing gh (exec approvals)…");
        const approvals = await gw.request<ExecApprovalsSnapshot>("exec.approvals.get", {});
        const file = approvals.file ?? { version: 1 };
        const agents = file.agents ?? {};

        const resolvedPath =
          typeof params?.ghResolvedPath === "string" && params.ghResolvedPath.trim()
            ? params.ghResolvedPath.trim()
            : null;
        const patterns = resolvedPath ? ["**/gh", "**/which", resolvedPath] : ["**/gh", "**/which"];

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

      setStatus("GitHub enabled.");
      return true;
    },
    [gw, loadConfig, setError, setStatus]
  );

  const onGitHubConnect = React.useCallback(
    async (pat: string) => {
      setStatus("Checking gh…");
      await run(async () => {
        const api = getDesktopApi();

        const checkRes = await api.ghCheck();
        if (!checkRes.ok) {
          const stderr = checkRes.stderr?.trim();
          const stdout = checkRes.stdout?.trim();
          throw new Error(stderr || stdout || "gh check failed");
        }

        setStatus("Signing in to GitHub…");
        const loginRes = await api.ghAuthLoginPat({ pat });
        if (!loginRes.ok) {
          const stderr = loginRes.stderr?.trim();
          const stdout = loginRes.stdout?.trim();
          throw new Error(stderr || stdout || "gh auth login failed");
        }

        setStatus("Verifying authentication…");
        const statusRes = await api.ghAuthStatus();
        if (!statusRes.ok) {
          const stderr = statusRes.stderr?.trim();
          const stdout = statusRes.stdout?.trim();
          throw new Error(stderr || stdout || "gh auth status failed");
        }

        const userRes = await api.ghApiUser();
        if (!userRes.ok) {
          const stderr = userRes.stderr?.trim();
          const stdout = userRes.stdout?.trim();
          throw new Error(stderr || stdout || "gh api user failed");
        }

        const resolvedPath = checkRes.resolvedPath ?? loginRes.resolvedPath ?? null;
        const ok = await enableGitHub({ ghResolvedPath: resolvedPath });
        if (ok) {
          markSkillConnected("github");
          goSkills();
        }
      });
    },
    [run, enableGitHub, goSkills, markSkillConnected, setStatus]
  );

  return { enableGitHub, onGitHubConnect };
}
