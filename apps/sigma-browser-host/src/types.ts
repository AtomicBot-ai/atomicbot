/** Lifecycle state broadcast by the launcher. */
export type GatewayState =
  | { kind: "starting"; port: number; logsDir: string; token: string }
  | { kind: "ready"; port: number; logsDir: string; url: string; token: string }
  | { kind: "failed"; port: number; logsDir: string; details: string; token: string };

/** Payload returned by the discovery endpoint `/gateway-status`. */
export interface GatewayStatusPayload {
  state: "idle" | "starting" | "ready" | "failed";
  url: string;
  port: number;
  token: string;
  logsDir: string;
  details?: string;
  pid: number;
  llamaPort: number | null;
}
