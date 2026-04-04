import React from "react";
import type { AsyncRunner, ConfigSnapshot, GatewayRpcLike, SkillId } from "./types";
import { getObject, getStringArray, unique } from "./onboarding-config-helpers";

type UseWelcomeNotionInput = {
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

export function useWelcomeNotion({
  gw,
  loadConfig,
  setError,
  setStatus,
  run,
  markSkillConnected,
  goSkills,
}: UseWelcomeNotionInput) {
  const saveNotionApiKey = React.useCallback(
    async (apiKey: string): Promise<boolean> => {
      const trimmed = apiKey.trim();
      if (!trimmed) {
        setError("Notion API key is required.");
        return false;
      }
      setError(null);
      setStatus("Saving Notion API key…");

      const snap = await loadConfig();
      const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
      if (!baseHash) {
        throw new Error("Config base hash missing. Reload and try again.");
      }

      await gw.request("config.patch", {
        baseHash,
        raw: JSON.stringify(
          {
            skills: {
              entries: {
                notion: {
                  apiKey: trimmed,
                  enabled: true,
                },
              },
            },
          },
          null,
          2
        ),
        note: "Welcome: configure Notion skill API key",
      });

      // Ensure curl is treated as a safe bin in exec allowlist mode.
      // Notion skill is curl-based; without this, users often hit "exec denied: allowlist miss".
      try {
        setStatus("Allowing curl (exec safeBins)…");
        const snap2 = await gw.request<ConfigSnapshot>("config.get", {});
        const baseHash2 =
          typeof snap2.hash === "string" && snap2.hash.trim() ? snap2.hash.trim() : null;
        if (baseHash2) {
          const cfg = getObject(snap2.config);
          const tools = getObject(cfg.tools);
          const exec = getObject(tools.exec);
          const existingSafeBins = getStringArray(exec.safeBins);
          const safeBins = unique([...existingSafeBins, "curl"].map((v) => v.toLowerCase()));
          if (safeBins.join(",") !== existingSafeBins.map((v) => v.toLowerCase()).join(",")) {
            await gw.request("config.patch", {
              baseHash: baseHash2,
              raw: JSON.stringify({ tools: { exec: { safeBins } } }, null, 2),
              note: "Welcome: allow curl for Notion skill",
            });
          }
        }
      } catch {
        // Best-effort; do not block onboarding.
      }

      // Notion skill commonly relies on curl-based API calls. When exec security is allowlist,
      // we pre-approve curl to avoid onboarding friction and "allowlist miss" failures.
      try {
        setStatus("Allowing curl (exec approvals)…");
        const approvals = await gw.request<ExecApprovalsSnapshot>("exec.approvals.get", {});
        const agentId = "main";
        const file = approvals.file ?? { version: 1 };
        const agents = file.agents ?? {};
        const agent = agents[agentId] ?? {};
        // Use a glob to match the resolved curl path across macOS setups.
        const allowlist = mergeAllowlistEntries(agent.allowlist, ["**/curl", "**/curl.exe"]);
        const nextFile: ExecApprovalsFile = {
          ...file,
          version: 1,
          agents: {
            ...agents,
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
        // Best-effort: Notion key is already saved; don't block progress.
        // Keep error silent unless user hits exec issues later.
        void err;
      }

      setStatus("Notion connected.");
      return true;
    },
    [gw, loadConfig, setError, setStatus]
  );

  const onNotionApiKeySubmit = React.useCallback(
    async (apiKey: string) => {
      await run(async () => {
        const ok = await saveNotionApiKey(apiKey);
        if (ok) {
          markSkillConnected("notion");
          goSkills();
        }
      });
    },
    [run, goSkills, markSkillConnected, saveNotionApiKey]
  );

  return { saveNotionApiKey, onNotionApiKeySubmit };
}
