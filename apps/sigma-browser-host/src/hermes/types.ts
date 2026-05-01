/**
 * Hermes launcher types.
 *
 * The Hermes launcher is a Node sidecar (parallel to openclaw-launcher.mjs)
 * that:
 *   - Spawns a Python Hermes Agent process from the bundled CPython pack.
 *   - Bridges Hermes' CDP client (Side A: WS server mocking the browser
 *     CDP root endpoint) to the Sigma Eclipse Extension's relay (Side B:
 *     OpenClaw-style relay WS). The extension then drives real tabs via
 *     chrome.debugger (Phase 1) or chrome.cdp.* (Phase 2).
 *   - Exposes a discovery endpoint at 127.0.0.1:19998/hermes-status that
 *     mirrors the OpenClaw gateway-status payload shape.
 */

/** Lifecycle state broadcast by the Hermes launcher. */
export type HermesState =
  | { kind: "starting"; relayPort: number; logsDir: string; relayToken: string }
  | {
      kind: "ready";
      relayPort: number;
      relayUrl: string;
      relayToken: string;
      cdpMockPort: number;
      cdpMockToken: string;
      hermesRpcPort: number;
      logsDir: string;
    }
  | {
      kind: "failed";
      relayPort: number;
      relayToken: string;
      logsDir: string;
      details: string;
    };

/** Payload returned by the Hermes discovery endpoint `/hermes-status`. */
export interface HermesStatusPayload {
  /** Lifecycle bucket the extension uses to decide whether to connect. */
  state: "idle" | "starting" | "ready" | "failed" | "not_installed";
  /** Hermes Pack install state (separate from runtime state). */
  pack: {
    installed: boolean;
    version?: string;
    sizeBytes?: number;
  };
  /** Side B relay endpoint for the extension's CdpRelayClient. */
  relayUrl: string;
  relayPort: number;
  relayToken: string;
  /** Hermes JSON-RPC chat endpoint for the sidepanel HermesChatProvider. */
  hermesRpcUrl?: string;
  /** Logs dir for diagnostics. */
  logsDir: string;
  /** Optional human-readable failure detail when state==="failed". */
  details?: string;
  /** PID of this launcher process (for diagnostics / crash detection). */
  pid: number;
  /** Active llama-server port that Hermes config points at. */
  llamaPort: number | null;
}

/** Parsed CDP message envelope as exchanged on the wire. */
export interface CdpMessage {
  /** Set on requests from a CDP client; echoed back on the response. */
  id?: number;
  /** Set on browser → client events. */
  method?: string;
  /** Request params or event payload. */
  params?: unknown;
  /** Response result for matched id. */
  result?: unknown;
  /** Response error for matched id. */
  error?: unknown;
  /**
   * Per-target session id when using flat sessions (Target.attachToTarget
   * with flatten=true). Hermes' CDP client uses flat mode by default.
   */
  sessionId?: string;
}

