import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { DEFAULT_AGENT_ID } from "../constants";
import { ensureDir } from "../util/fs";

export type ApiKeyProfile = {
  type: "api_key";
  provider: string;
  key: string;
};

export type AuthProfile = ApiKeyProfile;

export type AuthProfilesStore = {
  version: number;
  profiles: Record<string, AuthProfile>;
  order: Record<string, string[]>;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

export function resolveAuthProfilesPath(params: { stateDir: string; agentId?: string }): string {
  const agentId = params.agentId ?? DEFAULT_AGENT_ID;
  const agentDir = path.join(params.stateDir, "agents", agentId, "agent");
  return path.join(agentDir, "auth-profiles.json");
}

export function readAuthProfilesStore(params: { authProfilesPath: string }): AuthProfilesStore {
  let raw: unknown = undefined;
  try {
    if (fs.existsSync(params.authProfilesPath)) {
      const text = fs.readFileSync(params.authProfilesPath, "utf-8");
      raw = JSON.parse(text) as unknown;
    }
  } catch {
    raw = undefined;
  }

  const parsed = isPlainObject(raw) ? raw : {};
  const version = typeof parsed.version === "number" ? parsed.version : 1;

  const profilesRaw = isPlainObject(parsed.profiles) ? parsed.profiles : {};
  const profiles: Record<string, AuthProfile> = {};
  for (const [k, v] of Object.entries(profilesRaw)) {
    if (!isPlainObject(v)) {
      continue;
    }
    const type = v.type;
    if (type === "api_key") {
      const provider = typeof v.provider === "string" ? v.provider : "";
      const key = typeof v.key === "string" ? v.key : "";
      if (provider && key) {
        profiles[k] = { type: "api_key", provider, key };
      }
    }
  }

  const orderRaw = isPlainObject(parsed.order) ? parsed.order : {};
  const order: Record<string, string[]> = {};
  for (const [provider, ids] of Object.entries(orderRaw)) {
    if (!Array.isArray(ids)) {
      continue;
    }
    const list = ids.map((id) => (typeof id === "string" ? id : "")).filter(Boolean);
    if (list.length > 0) {
      order[provider] = list;
    }
  }

  return { version, profiles, order };
}

export function writeAuthProfilesStoreAtomic(params: { authProfilesPath: string; store: AuthProfilesStore }) {
  ensureDir(path.dirname(params.authProfilesPath));
  const tmp = `${params.authProfilesPath}.${randomBytes(8).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(params.store, null, 2)}\n`, { encoding: "utf-8" });
  try {
    fs.chmodSync(tmp, 0o600);
  } catch {
    // ignore
  }
  fs.renameSync(tmp, params.authProfilesPath);
  try {
    fs.chmodSync(params.authProfilesPath, 0o600);
  } catch {
    // ignore
  }
}

