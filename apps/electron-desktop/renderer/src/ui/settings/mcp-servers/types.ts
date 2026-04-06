export type McpTransportType = "stdio" | "http";

export type McpServerFormData = {
  name: string;
  transportType: McpTransportType;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  transport?: "sse" | "streamable-http";
  headers?: Record<string, string>;
  connectionTimeoutMs?: number;
};

export type McpServerEntry = {
  name: string;
  config: Record<string, unknown>;
};
