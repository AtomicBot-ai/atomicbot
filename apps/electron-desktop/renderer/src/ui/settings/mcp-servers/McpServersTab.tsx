import React from "react";

import { settingsStyles as ps } from "../SettingsPage";
import { PrimaryButton, ConfirmDialog } from "@shared/kit";
import { errorToMessage } from "@shared/toast";
import { useMcpServers } from "./useMcpServers";
import { McpServerModal } from "./McpServerModal";
import type { McpServerFormData, McpServerEntry } from "./types";
import type { ConfigSnapshot, GatewayRpcLike } from "../../onboarding/hooks/types";
import css from "./McpServersTab.module.css";

function describeServer(config: Record<string, unknown>): string {
  if (typeof config.command === "string") {
    const cmd = config.command;
    const args = Array.isArray(config.args) ? ` ${config.args.join(" ")}` : "";
    const full = `${cmd}${args}`;
    return `stdio · ${full.length > 60 ? full.slice(0, 57) + "…" : full}`;
  }
  if (typeof config.url === "string") {
    const transport = config.transport === "streamable-http" ? "streamable-http" : "sse";
    return `${transport} · ${config.url}`;
  }
  return "unknown transport";
}

function mergeOptimistic(
  base: McpServerEntry[],
  added: McpServerEntry[],
  removed: Set<string>,
): McpServerEntry[] {
  const merged = base.filter((s) => !removed.has(s.name));
  for (const entry of added) {
    const idx = merged.findIndex((s) => s.name === entry.name);
    if (idx >= 0) {
      merged[idx] = entry;
    } else {
      merged.push(entry);
    }
  }
  return merged.sort((a, b) => a.name.localeCompare(b.name));
}

export function McpServersTab(props: {
  gw: GatewayRpcLike;
  configSnap: ConfigSnapshot | null;
  reload: () => Promise<void>;
  onError: (value: string | null) => void;
}) {
  const { servers, addOrUpdateServer, addOrUpdateServersRaw, removeServer, refresh, configToFormData } = useMcpServers({
    gw: props.gw,
    configSnap: props.configSnap,
    reload: props.reload,
  });

  const [modalOpen, setModalOpen] = React.useState(false);
  const [editData, setEditData] = React.useState<McpServerFormData | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  const [syncing, setSyncing] = React.useState(false);
  const [optimisticAdded, setOptimisticAdded] = React.useState<McpServerEntry[]>([]);
  const [optimisticRemoved, setOptimisticRemoved] = React.useState<Set<string>>(new Set());

  const displayServers = React.useMemo(
    () => mergeOptimistic(servers, optimisticAdded, optimisticRemoved),
    [servers, optimisticAdded, optimisticRemoved],
  );

  React.useEffect(() => {
    if (optimisticAdded.length === 0 && optimisticRemoved.size === 0) return;
    setOptimisticAdded([]);
    setOptimisticRemoved(new Set());
  }, [servers]);

  const openAdd = React.useCallback(() => {
    setEditData(undefined);
    setModalOpen(true);
  }, []);

  const openEdit = React.useCallback(
    (name: string) => {
      const entry = displayServers.find((s) => s.name === name);
      if (!entry) return;
      setEditData(configToFormData(name, entry.config));
      setModalOpen(true);
    },
    [displayServers, configToFormData],
  );

  const closeModal = React.useCallback(() => {
    setModalOpen(false);
    setEditData(undefined);
  }, []);

  const refreshAfterPatch = React.useCallback(async () => {
    setSyncing(true);
    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      try {
        await refresh();
        setSyncing(false);
        return;
      } catch {
        if (attempt === maxAttempts) {
          setSyncing(false);
          return;
        }
      }
    }
  }, [refresh]);

  const handleSave = React.useCallback(
    async (data: McpServerFormData) => {
      props.onError(null);
      try {
        await addOrUpdateServer(data);
      } catch (err) {
        props.onError(errorToMessage(err));
        throw err;
      }
      const config: Record<string, unknown> = {};
      if (data.transportType === "stdio") {
        if (data.command) config.command = data.command;
        if (data.args?.length) config.args = data.args;
      } else {
        if (data.url) config.url = data.url;
        if (data.transport) config.transport = data.transport;
      }
      setOptimisticAdded((prev) => [...prev, { name: data.name, config }]);
      void refreshAfterPatch();
    },
    [addOrUpdateServer, props, refreshAfterPatch],
  );

  const handleSaveRaw = React.useCallback(
    async (entries: Array<{ name: string; config: Record<string, unknown> }>) => {
      props.onError(null);
      try {
        await addOrUpdateServersRaw(entries);
      } catch (err) {
        props.onError(errorToMessage(err));
        throw err;
      }
      setOptimisticAdded((prev) => [...prev, ...entries]);
      void refreshAfterPatch();
    },
    [addOrUpdateServersRaw, props, refreshAfterPatch],
  );

  const handleDelete = React.useCallback(async () => {
    if (!deleteTarget) return;
    const name = deleteTarget;
    setDeleteTarget(null);
    setOptimisticRemoved((prev) => new Set(prev).add(name));
    props.onError(null);
    try {
      await removeServer(name);
    } catch (err) {
      setOptimisticRemoved((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
      props.onError(errorToMessage(err));
      return;
    }
    void refreshAfterPatch();
  }, [deleteTarget, props, removeServer, refreshAfterPatch]);

  return (
    <div className={ps.UiSettingsContentInner}>
      <div className={css.McpHeaderRow}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className={ps.UiSettingsTabTitle} style={{ marginBottom: 0 }}>
            MCP Servers
          </div>
          {syncing && (
            <span className={css.McpSyncBadge}>
              <span className="UiButtonSpinner" aria-hidden="true" />
              Syncing
            </span>
          )}
        </div>
        <PrimaryButton size="sm" onClick={openAdd}>
          Add Server
        </PrimaryButton>
      </div>

      {displayServers.length === 0 && !syncing ? (
        <div className={css.McpEmptyState}>
          <div>No MCP servers configured.</div>
          <div>
            Add external tool servers using the{" "}
            <a
              href="https://modelcontextprotocol.io"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#0d6fff" }}
            >
              Model Context Protocol
            </a>{" "}
            to extend your agent with custom tools.
          </div>
        </div>
      ) : (
        <div>
          {displayServers.map((entry) => (
            <div
              key={entry.name}
              className={css.McpServerCard}
              role="button"
              tabIndex={0}
              onClick={() => openEdit(entry.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") openEdit(entry.name);
              }}
            >
              <div className={css.McpServerInfo}>
                <div className={css.McpServerName}>{entry.name}</div>
                <div className={css.McpServerMeta}>{describeServer(entry.config)}</div>
              </div>
              <div className={css.McpServerActions}>
                <button
                  type="button"
                  className={css.McpDeleteButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(entry.name);
                  }}
                  aria-label={`Delete ${entry.name}`}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <McpServerModal
        open={modalOpen}
        onClose={closeModal}
        onSave={handleSave}
        onSaveRaw={handleSaveRaw}
        initial={editData}
        existingNames={displayServers.map((s) => s.name)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Remove MCP server "${deleteTarget}"?`}
        subtitle="This will remove the server configuration. The server process will stop on the next agent session."
        confirmLabel="Remove"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
