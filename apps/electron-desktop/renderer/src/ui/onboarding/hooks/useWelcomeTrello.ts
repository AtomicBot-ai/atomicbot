import React from "react";
import type { AsyncRunner, ConfigSnapshot, GatewayRpcLike, SkillId } from "./types";
import { getObject, getStringArray, unique } from "./onboarding-config-helpers";

type UseWelcomeTrelloInput = {
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

export function useWelcomeTrello({
  gw,
  loadConfig,
  setError,
  setStatus,
  run,
  markSkillConnected,
  goSkills,
}: UseWelcomeTrelloInput) {
  const saveTrello = React.useCallback(
    async (apiKey: string, token: string): Promise<boolean> => {
      const trimmedKey = apiKey.trim();
      const trimmedToken = token.trim();
      if (!trimmedKey || !trimmedToken) {
        setError("Trello API key and token are required.");
        return false;
      }
      setError(null);
      setStatus("Saving Trello credentials…");

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
                trello: {
                  enabled: true,
                  env: {
                    TRELLO_API_KEY: trimmedKey,
                    TRELLO_TOKEN: trimmedToken,
                  },
                },
              },
            },
          },
          null,
          2
        ),
        note: "Welcome: configure Trello skill credentials",
      });

      // Trello skill is curl+jq based. When exec security is allowlist, pre-approve bins
      // to reduce onboarding friction and avoid "allowlist miss" failures.
      try {
        setStatus("Allowing curl and jq (exec defaults)…");
        const snap2 = await gw.request<ConfigSnapshot>("config.get", {});
        const baseHash2 =
          typeof snap2.hash === "string" && snap2.hash.trim() ? snap2.hash.trim() : null;
        if (baseHash2) {
          const cfg = getObject(snap2.config);
          const tools = getObject(cfg.tools);
          const exec = getObject(tools.exec);
          const existingSafeBins = getStringArray(exec.safeBins);
          const safeBins = unique([...existingSafeBins, "curl", "jq"].map((v) => v.toLowerCase()));
          const hostRaw = typeof exec.host === "string" ? exec.host.trim() : "";
          // Trello relies on bundled binaries (jq) and curl; prefer host=gateway when unset (or sandbox default).
          const host = !hostRaw || hostRaw === "sandbox" ? "gateway" : hostRaw;
          const securityRaw = typeof exec.security === "string" ? exec.security.trim() : "";
          const security = securityRaw || "allowlist";
          const askRaw = typeof exec.ask === "string" ? exec.ask.trim() : "";
          const ask = askRaw || "on-miss";

          const safeBinsChanged =
            safeBins.join(",") !== existingSafeBins.map((v) => v.toLowerCase()).join(",");
          const needsHost = host !== hostRaw;
          const needsSecurity = security !== securityRaw;
          const needsAsk = ask !== askRaw;

          if (safeBinsChanged || needsHost || needsSecurity || needsAsk) {
            await gw.request("config.patch", {
              baseHash: baseHash2,
              raw: JSON.stringify({ tools: { exec: { host, security, ask, safeBins } } }, null, 2),
              note: "Welcome: ensure exec defaults for Trello (curl+jq)",
            });
          }
        }
      } catch {
        // Best-effort; do not block onboarding.
      }

      try {
        setStatus("Allowing curl and jq (exec approvals)…");
        const approvals = await gw.request<ExecApprovalsSnapshot>("exec.approvals.get", {});
        const agentId = "main";
        const file = approvals.file ?? { version: 1 };
        const agents = file.agents ?? {};
        const agent = agents[agentId] ?? {};
        // `which` is commonly used by agents to check tool availability. Pre-approve it alongside curl+jq
        // so simple checks don't require per-command confirmations in allowlist mode.
        const allowlist = mergeAllowlistEntries(agent.allowlist, [
          "**/curl",
          "**/curl.exe",
          "**/jq",
          "**/jq.exe",
          "**/which",
          "**/which.exe",
        ]);
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
        // Best-effort: Trello creds are already saved; don't block progress.
        void err;
      }

      setStatus("Trello connected.");
      return true;
    },
    [gw, loadConfig, setError, setStatus]
  );

  const onTrelloSubmit = React.useCallback(
    async (apiKey: string, token: string) => {
      await run(async () => {
        const ok = await saveTrello(apiKey, token);
        if (ok) {
          markSkillConnected("trello");
          goSkills();
        }
      });
    },
    [run, goSkills, markSkillConnected, saveTrello]
  );

  return { saveTrello, onTrelloSubmit };
}
