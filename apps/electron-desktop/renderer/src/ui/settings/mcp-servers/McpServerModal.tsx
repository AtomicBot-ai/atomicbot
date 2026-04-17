import React from "react";
import { Modal, TextInput, SelectDropdown, PrimaryButton, SecondaryButton } from "@shared/kit";
import type { McpServerFormData, McpTransportType } from "./types";

type InputMode = "form" | "json";

const TRANSPORT_OPTIONS: Array<{ value: McpTransportType; label: string }> = [
  { value: "stdio", label: "Command (stdio)" },
  { value: "http", label: "URL (HTTP)" },
];

const HTTP_TRANSPORT_OPTIONS: Array<{ value: "sse" | "streamable-http"; label: string }> = [
  { value: "sse", label: "SSE" },
  { value: "streamable-http", label: "Streamable HTTP" },
];

function parseKeyValueString(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

function keyValueToString(record: Record<string, string> | undefined): string {
  if (!record) return "";
  return Object.entries(record)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

function formDataToJson(data: McpServerFormData | undefined): string {
  if (!data) return '{\n  "command": "npx",\n  "args": ["-y", "@modelcontextprotocol/server-example"]\n}';
  const config: Record<string, unknown> = {};
  if (data.transportType === "stdio") {
    if (data.command) config.command = data.command;
    if (data.args?.length) config.args = data.args;
    if (data.env && Object.keys(data.env).length > 0) config.env = data.env;
    if (data.cwd) config.cwd = data.cwd;
  } else {
    if (data.url) config.url = data.url;
    if (data.transport) config.transport = data.transport;
    if (data.headers && Object.keys(data.headers).length > 0) config.headers = data.headers;
  }
  if (data.connectionTimeoutMs != null && data.connectionTimeoutMs > 0) {
    config.connectionTimeoutMs = data.connectionTimeoutMs;
  }
  return JSON.stringify(config, null, 2);
}

/**
 * Parse a raw JSON string that can be either:
 * - A single server object: { "command": "...", ... }
 * - A named wrapper: { "my-server": { "command": "...", ... } }
 * - A full mcp.servers block: { "mcpServers": { "name": { ... } } }
 *
 * Returns an array of [name, config] pairs.
 */
function parseJsonInput(
  raw: string,
  fallbackName: string,
): { entries: Array<{ name: string; config: Record<string, unknown> }>; error?: undefined } | { error: string; entries?: undefined } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Invalid JSON. Check syntax and try again." };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "JSON must be an object." };
  }

  const obj = parsed as Record<string, unknown>;

  // Format: { "mcpServers": { "name": { ... } } } (Claude/Cursor style)
  if (obj.mcpServers && typeof obj.mcpServers === "object" && !Array.isArray(obj.mcpServers)) {
    const servers = obj.mcpServers as Record<string, unknown>;
    const entries = Object.entries(servers)
      .filter(([, v]) => v && typeof v === "object" && !Array.isArray(v))
      .map(([n, v]) => ({ name: n, config: v as Record<string, unknown> }));
    if (entries.length === 0) return { error: 'No valid server entries found inside "mcpServers".' };
    return { entries };
  }

  // Heuristic: is this a server config itself? (has command or url at top level)
  if (typeof obj.command === "string" || typeof obj.url === "string") {
    return { entries: [{ name: fallbackName, config: obj as Record<string, unknown> }] };
  }

  // Otherwise treat as { "name": { ... }, "name2": { ... } }
  const entries = Object.entries(obj)
    .filter(([, v]) => v && typeof v === "object" && !Array.isArray(v))
    .map(([n, v]) => ({ name: n, config: v as Record<string, unknown> }));
  if (entries.length === 0) {
    return { error: "Could not detect server configuration. Provide an object with command or url." };
  }
  return { entries };
}

const MODE_TAB_STYLE: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: 13,
  background: "none",
  border: "none",
  borderBottom: 0,
  color: "rgba(230, 237, 243, 0.55)",
  cursor: "pointer",
  outline: "none",
  textDecoration: "none",
  transition: "color 120ms, border-color 120ms",
};

const MODE_TAB_ACTIVE: React.CSSProperties = {
  ...MODE_TAB_STYLE,
  color: "#fff",
  borderBottom: "2px solid #0d6fff",
};

export function McpServerModal(props: {
  open: boolean;
  onClose: () => void;
  onSave: (data: McpServerFormData) => Promise<void>;
  onSaveRaw?: (entries: Array<{ name: string; config: Record<string, unknown> }>) => Promise<void>;
  initial?: McpServerFormData;
  existingNames: string[];
}) {
  const { open, onClose, onSave, onSaveRaw, initial, existingNames } = props;
  const isEdit = !!initial;

  const [mode, setMode] = React.useState<InputMode>("form");
  const [name, setName] = React.useState(initial?.name ?? "");
  const [transportType, setTransportType] = React.useState<McpTransportType>(
    initial?.transportType ?? "stdio",
  );
  const [command, setCommand] = React.useState(initial?.command ?? "");
  const [args, setArgs] = React.useState(initial?.args?.join(" ") ?? "");
  const [envText, setEnvText] = React.useState(keyValueToString(initial?.env));
  const [cwd, setCwd] = React.useState(initial?.cwd ?? "");
  const [url, setUrl] = React.useState(initial?.url ?? "");
  const [httpTransport, setHttpTransport] = React.useState<"sse" | "streamable-http">(
    initial?.transport ?? (isEdit ? "sse" : "streamable-http"),
  );
  const [headersText, setHeadersText] = React.useState(keyValueToString(initial?.headers));
  const [timeoutMs, setTimeoutMs] = React.useState(
    initial?.connectionTimeoutMs?.toString() ?? "",
  );
  const [jsonText, setJsonText] = React.useState(() => formDataToJson(initial));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setMode("form");
    setName(initial?.name ?? "");
    setTransportType(initial?.transportType ?? "stdio");
    setCommand(initial?.command ?? "");
    setArgs(initial?.args?.join(" ") ?? "");
    setEnvText(keyValueToString(initial?.env));
    setCwd(initial?.cwd ?? "");
    setUrl(initial?.url ?? "");
    setHttpTransport(initial?.transport ?? (isEdit ? "sse" : "streamable-http"));
    setHeadersText(keyValueToString(initial?.headers));
    setTimeoutMs(initial?.connectionTimeoutMs?.toString() ?? "");
    setJsonText(formDataToJson(initial));
    setSaving(false);
    setError(null);
  }, [open, initial]);

  const handleFileUpload = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result;
      if (typeof text === "string") {
        setJsonText(text);
        setError(null);
      }
    };
    reader.onerror = () => setError("Failed to read file.");
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  const validateForm = (): string | null => {
    const trimmedName = name.trim();
    if (!trimmedName) return "Server name is required.";
    if (!isEdit && existingNames.includes(trimmedName)) {
      return `Server "${trimmedName}" already exists.`;
    }
    if (transportType === "stdio") {
      if (!command.trim()) return "Command is required for stdio transport.";
    } else {
      if (!url.trim()) return "URL is required for HTTP transport.";
    }
    if (timeoutMs.trim()) {
      const parsed = Number(timeoutMs.trim());
      if (Number.isNaN(parsed) || parsed < 0) return "Timeout must be a non-negative number.";
    }
    return null;
  };

  const handleSaveForm = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    const argsArray = args
      .trim()
      .split(/\s+/)
      .filter((s) => s.length > 0);
    const parsedTimeout = timeoutMs.trim() ? Number(timeoutMs.trim()) : undefined;

    const data: McpServerFormData = {
      name: name.trim(),
      transportType,
      ...(transportType === "stdio"
        ? {
            command: command.trim(),
            args: argsArray.length > 0 ? argsArray : undefined,
            env: envText.trim() ? parseKeyValueString(envText) : undefined,
            cwd: cwd.trim() || undefined,
          }
        : {
            url: url.trim(),
            transport: httpTransport,
            headers: headersText.trim() ? parseKeyValueString(headersText) : undefined,
          }),
      connectionTimeoutMs: parsedTimeout,
    };

    setSaving(true);
    setError(null);
    try {
      await onSave(data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveJson = async () => {
    if (!jsonText.trim()) {
      setError("JSON content is empty.");
      return;
    }

    const fallbackName = name.trim() || "mcp-server";
    const result = parseJsonInput(jsonText, fallbackName);
    if (result.error) {
      setError(result.error);
      return;
    }

    if (!isEdit) {
      for (const entry of result.entries) {
        if (existingNames.includes(entry.name) && entry.name !== initial?.name) {
          setError(`Server "${entry.name}" already exists.`);
          return;
        }
      }
    }

    for (const entry of result.entries) {
      if (typeof entry.config.url === "string" && !entry.config.transport) {
        entry.config.transport = "streamable-http";
      }
    }

    setSaving(true);
    setError(null);
    try {
      if (onSaveRaw) {
        await onSaveRaw(result.entries);
      } else {
        for (const entry of result.entries) {
          const hasUrl = typeof entry.config.url === "string" && (entry.config.url as string).trim().length > 0;
          await onSave({
            name: entry.name,
            transportType: hasUrl ? "http" : "stdio",
            ...entry.config,
          } as McpServerFormData);
        }
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = mode === "form" ? handleSaveForm : handleSaveJson;

  if (!open) return null;

  return (
    <Modal
      open={open}
      header={isEdit ? `Edit "${initial.name}"` : "Add MCP Server"}
      onClose={onClose}
      aria-label={isEdit ? `Edit MCP server ${initial.name}` : "Add MCP server"}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Mode tabs */}
        <div style={{ display: "flex", gap: 0 }}>
          <button
            type="button"
            style={mode === "form" ? MODE_TAB_ACTIVE : MODE_TAB_STYLE}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMode("form")}
          >
            Form
          </button>
          <button
            type="button"
            style={mode === "json" ? MODE_TAB_ACTIVE : MODE_TAB_STYLE}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMode("json")}
          >
            JSON
          </button>
        </div>

        {mode === "form" ? (
          <>
            <TextInput
              label="Server Name"
              value={name}
              onChange={setName}
              placeholder="my-mcp-server"
              disabled={isEdit}
            />

            <SelectDropdown
              label="Transport"
              value={transportType}
              onChange={(v) => setTransportType(v)}
              options={TRANSPORT_OPTIONS}
            />

            {transportType === "stdio" ? (
              <>
                <TextInput
                  label="Command"
                  value={command}
                  onChange={setCommand}
                  placeholder="npx"
                />
                <TextInput
                  label="Arguments (space-separated)"
                  value={args}
                  onChange={setArgs}
                  placeholder="-y @modelcontextprotocol/server-example"
                />
                <div>
                  <label className="UiInputLabel">Environment Variables (KEY=VALUE, one per line)</label>
                  <div className="UiInputWrap">
                    <textarea
                      className="UiInput"
                      value={envText}
                      onChange={(e) => setEnvText(e.target.value)}
                      placeholder={"NODE_ENV=production\nDEBUG=true"}
                      rows={3}
                      style={{ resize: "vertical", fontFamily: "var(--font-mono, monospace)" }}
                    />
                  </div>
                </div>
                <TextInput
                  label="Working Directory"
                  value={cwd}
                  onChange={setCwd}
                  placeholder="/path/to/working/dir"
                />
              </>
            ) : (
              <>
                <TextInput
                  label="URL"
                  value={url}
                  onChange={setUrl}
                  placeholder="https://mcp-server.example.com/sse"
                />
                <SelectDropdown
                  label="HTTP Transport"
                  value={httpTransport}
                  onChange={(v) => setHttpTransport(v)}
                  options={HTTP_TRANSPORT_OPTIONS}
                />
                <div>
                  <label className="UiInputLabel">Headers (KEY=VALUE, one per line)</label>
                  <div className="UiInputWrap">
                    <textarea
                      className="UiInput"
                      value={headersText}
                      onChange={(e) => setHeadersText(e.target.value)}
                      placeholder={"Authorization=Bearer token123"}
                      rows={3}
                      style={{ resize: "vertical", fontFamily: "var(--font-mono, monospace)" }}
                    />
                  </div>
                </div>
              </>
            )}

            <TextInput
              label="Connection Timeout (ms)"
              value={timeoutMs}
              onChange={setTimeoutMs}
              placeholder="30000"
            />
          </>
        ) : (
          <>
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <label className="UiInputLabel" style={{ margin: 0 }}>
                  Server JSON Configuration
                </label>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      background: "none",
                      border: "1px solid rgba(230, 237, 243, 0.15)",
                      borderRadius: 4,
                      color: "rgba(230, 237, 243, 0.75)",
                      fontSize: 12,
                      padding: "3px 10px",
                      cursor: "pointer",
                    }}
                  >
                    Load File
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    style={{ display: "none" }}
                    onChange={handleFileUpload}
                  />
                </div>
              </div>
              <div className="UiInputWrap">
                <textarea
                  className="UiInput"
                  value={jsonText}
                  onChange={(e) => { setJsonText(e.target.value); setError(null); }}
                  placeholder={'{\n  "command": "npx",\n  "args": ["-y", "@modelcontextprotocol/server-example"]\n}'}
                  rows={12}
                  style={{ resize: "vertical", fontFamily: "var(--font-mono, monospace)", fontSize: 13, lineHeight: 1.5 }}
                  spellCheck={false}
                />
              </div>
              <div style={{ fontSize: 11, color: "rgba(230, 237, 243, 0.4)", marginTop: 4 }}>
                Accepts a single server object, a named map, or a Claude/Cursor-style {"{"}"mcpServers": {"{"} ... {"}"}{"}"}  wrapper.
              </div>
            </div>

            {!isEdit && (
              <TextInput
                label="Server Name (used if JSON has no name)"
                value={name}
                onChange={setName}
                placeholder="my-mcp-server"
              />
            )}
          </>
        )}

        {error && <div className="InputErrorMessage">{error}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave} loading={saving} disabled={saving}>
            {isEdit ? "Save" : "Add Server"}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
