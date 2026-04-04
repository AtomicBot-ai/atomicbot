import React from "react";
import { getDesktopApi } from "@ipc/desktopApi";
import type { AsyncRunner, ConfigSnapshot, GatewayRpcLike, SkillId } from "./types";
import { getObject, getStringArray, unique } from "./onboarding-config-helpers";

type UseWelcomeAppleRemindersInput = {
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

export function useWelcomeAppleReminders({
  gw,
  loadConfig,
  setError,
  setStatus,
  run,
  markSkillConnected,
  goSkills,
}: UseWelcomeAppleRemindersInput) {
  const enableAppleReminders = React.useCallback(
    async (params?: { remindctlResolvedPath?: string | null }): Promise<boolean> => {
      setError(null);
      setStatus("Enabling Apple Reminders skill…");

      const snap = await loadConfig();
      const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
      if (!baseHash) {
        throw new Error("Config base hash missing. Reload and try again.");
      }

      const cfg = getObject(snap.config);
      const tools = getObject(cfg.tools);
      const exec = getObject(tools.exec);
      const existingSafeBins = getStringArray(exec.safeBins);
      const safeBins = unique(
        [...existingSafeBins, "remindctl", "which"].map((v) => v.toLowerCase())
      );

      const hostRaw = typeof exec.host === "string" ? exec.host.trim() : "";
      // Apple Reminders uses a bundled binary that is guaranteed on the gateway host PATH. In sandbox
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
                "apple-reminders": {
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
        note: "Welcome: enable Apple Reminders (remindctl) skill",
      });

      try {
        setStatus("Allowing remindctl (exec approvals)…");
        const approvals = await gw.request<ExecApprovalsSnapshot>("exec.approvals.get", {});
        const file = approvals.file ?? { version: 1 };
        const agents = file.agents ?? {};
        const remindctlResolvedPath =
          typeof params?.remindctlResolvedPath === "string" && params.remindctlResolvedPath.trim()
            ? params.remindctlResolvedPath.trim()
            : null;
        const patterns = remindctlResolvedPath
          ? ["**/remindctl", "**/which", remindctlResolvedPath]
          : ["**/remindctl", "**/which"];

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

      setStatus("Apple Reminders enabled.");
      return true;
    },
    [gw, loadConfig, setError, setStatus]
  );

  const onAppleRemindersAuthorizeAndEnable = React.useCallback(async () => {
    setStatus("Authorizing remindctl…");
    await run(async () => {
      const api = getDesktopApi();
      const authorizeRes = await api.remindctlAuthorize();
      if (!authorizeRes.ok) {
        const stderr = authorizeRes.stderr?.trim();
        const stdout = authorizeRes.stdout?.trim();
        throw new Error(stderr || stdout || "remindctl authorize failed");
      }

      setStatus("Checking Reminders access…");
      const todayRes = await api.remindctlTodayJson();
      if (!todayRes.ok) {
        const stderr = todayRes.stderr?.trim();
        const stdout = todayRes.stdout?.trim();
        throw new Error(stderr || stdout || "remindctl check failed");
      }

      const resolvedPath = todayRes.resolvedPath ?? authorizeRes.resolvedPath ?? null;
      const ok = await enableAppleReminders({ remindctlResolvedPath: resolvedPath });
      if (ok) {
        markSkillConnected("apple-reminders");
        goSkills();
      }
    });
  }, [run, enableAppleReminders, goSkills, markSkillConnected, setStatus]);

  return { enableAppleReminders, onAppleRemindersAuthorizeAndEnable };
}
