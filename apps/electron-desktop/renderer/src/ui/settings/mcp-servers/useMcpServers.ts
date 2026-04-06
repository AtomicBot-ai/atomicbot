import React from "react";

import { getObject } from "@shared/utils/configHelpers";
import type { ConfigSnapshot, GatewayRpcLike } from "../../onboarding/hooks/types";
import type { McpServerEntry, McpServerFormData } from "./types";

function isGatewayRestartError(err: unknown): boolean {
  const msg = String(err);
  return (
    msg.includes("1012") ||
    msg.includes("service restart") ||
    msg.includes("gateway closed") ||
    msg.includes("gateway not connected")
  );
}

function parseServers(config: unknown): McpServerEntry[] {
  const cfg = getObject(config);
  const mcp = getObject(cfg.mcp);
  const servers = getObject(mcp.servers);

  return Object.entries(servers)
    .filter(([, v]) => v && typeof v === "object" && !Array.isArray(v))
    .map(([name, v]) => ({ name, config: v as Record<string, unknown> }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function formDataToConfig(data: McpServerFormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (data.transportType === "stdio") {
    if (data.command) result.command = data.command;
    if (data.args && data.args.length > 0) result.args = data.args;
    if (data.env && Object.keys(data.env).length > 0) result.env = data.env;
    if (data.cwd) result.cwd = data.cwd;
  } else {
    if (data.url) result.url = data.url;
    if (data.transport) result.transport = data.transport;
    if (data.headers && Object.keys(data.headers).length > 0) result.headers = data.headers;
  }

  if (data.connectionTimeoutMs != null && data.connectionTimeoutMs > 0) {
    result.connectionTimeoutMs = data.connectionTimeoutMs;
  }

  return result;
}

function configToFormData(name: string, config: Record<string, unknown>): McpServerFormData {
  const hasUrl = typeof config.url === "string" && config.url.trim().length > 0;
  const transportType = hasUrl ? "http" : "stdio";

  const data: McpServerFormData = { name, transportType };

  if (transportType === "stdio") {
    if (typeof config.command === "string") data.command = config.command;
    if (Array.isArray(config.args)) data.args = config.args.map(String);
    if (config.env && typeof config.env === "object" && !Array.isArray(config.env)) {
      const env: Record<string, string> = {};
      for (const [k, v] of Object.entries(config.env as Record<string, unknown>)) {
        env[k] = String(v);
      }
      data.env = env;
    }
    if (typeof config.cwd === "string") data.cwd = config.cwd;
    if (typeof config.workingDirectory === "string" && !data.cwd) data.cwd = config.workingDirectory;
  } else {
    if (typeof config.url === "string") data.url = config.url;
    if (config.transport === "sse" || config.transport === "streamable-http") {
      data.transport = config.transport;
    }
    if (config.headers && typeof config.headers === "object" && !Array.isArray(config.headers)) {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(config.headers as Record<string, unknown>)) {
        headers[k] = String(v);
      }
      data.headers = headers;
    }
  }

  if (typeof config.connectionTimeoutMs === "number" && config.connectionTimeoutMs > 0) {
    data.connectionTimeoutMs = config.connectionTimeoutMs;
  }

  return data;
}

export function useMcpServers(props: {
  gw: GatewayRpcLike;
  configSnap: ConfigSnapshot | null;
  reload: () => Promise<void>;
}) {
  const { gw, configSnap, reload } = props;
  const [servers, setServers] = React.useState<McpServerEntry[]>(() =>
    parseServers(configSnap?.config),
  );

  React.useEffect(() => {
    if (!configSnap) return;
    setServers(parseServers(configSnap.config));
  }, [configSnap]);

  const loadConfig = React.useCallback(async () => {
    return await gw.request<ConfigSnapshot>("config.get", {});
  }, [gw]);

  const addOrUpdateServer = React.useCallback(
    async (data: McpServerFormData) => {
      const snap = await loadConfig();
      const baseHash =
        typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
      if (!baseHash) {
        throw new Error("Config base hash missing. Reload and try again.");
      }

      const serverConfig = formDataToConfig(data);
      try {
        await gw.request("config.patch", {
          baseHash,
          raw: JSON.stringify({ mcp: { servers: { [data.name]: serverConfig } } }, null, 2),
          note: `Settings: configure MCP server "${data.name}"`,
        });
      } catch (err) {
        if (!isGatewayRestartError(err)) throw err;
      }
    },
    [gw, loadConfig],
  );

  const removeServer = React.useCallback(
    async (name: string) => {
      const snap = await loadConfig();
      const baseHash =
        typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
      if (!baseHash) {
        throw new Error("Config base hash missing. Reload and try again.");
      }

      // JSON Merge Patch (RFC 7396): null value deletes the key
      try {
        await gw.request("config.patch", {
          baseHash,
          raw: JSON.stringify({ mcp: { servers: { [name]: null } } }, null, 2),
          note: `Settings: remove MCP server "${name}"`,
        });
      } catch (err) {
        if (!isGatewayRestartError(err)) throw err;
      }
    },
    [gw, loadConfig],
  );

  const addOrUpdateServersRaw = React.useCallback(
    async (entries: Array<{ name: string; config: Record<string, unknown> }>) => {
      const snap = await loadConfig();
      const baseHash =
        typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
      if (!baseHash) {
        throw new Error("Config base hash missing. Reload and try again.");
      }

      const patch: Record<string, Record<string, unknown>> = {};
      for (const entry of entries) {
        patch[entry.name] = entry.config;
      }

      const names = entries.map((e) => e.name).join(", ");
      try {
        await gw.request("config.patch", {
          baseHash,
          raw: JSON.stringify({ mcp: { servers: patch } }, null, 2),
          note: `Settings: configure MCP server(s) ${names}`,
        });
      } catch (err) {
        if (!isGatewayRestartError(err)) throw err;
      }
    },
    [gw, loadConfig],
  );

  const refresh = React.useCallback(async () => {
    await reload();
  }, [reload]);

  return { servers, addOrUpdateServer, addOrUpdateServersRaw, removeServer, refresh, loadConfig, configToFormData };
}
