import * as http from "node:http";
import type { GatewayState, GatewayStatusPayload } from "./types";

/**
 * Tiny loopback HTTP endpoint used by the browser extension to discover the
 * Gateway's `{url, port, token, state}` without going through Native Messaging.
 *
 *   GET /gateway-status         -> JSON payload
 *   GET /healthz                -> 200 OK
 *   OPTIONS *                   -> CORS preflight
 *
 * Binds strictly to `127.0.0.1` so only same-host processes can reach it.
 */
export interface DiscoveryServer {
  readonly port: number;
  update(state: GatewayState | null): void;
  setLlamaPort(port: number | null): void;
  close(): Promise<void>;
}

export async function startDiscoveryServer(params: {
  preferredPort: number;
  allowedExtensionOrigins?: string[];
  initialState?: GatewayState | null;
  llamaPort?: number | null;
}): Promise<DiscoveryServer> {
  const allowedOrigins = new Set(params.allowedExtensionOrigins ?? []);
  let currentState: GatewayState | null = params.initialState ?? null;
  let llamaPort: number | null = params.llamaPort ?? null;

  const buildPayload = (): GatewayStatusPayload => {
    if (!currentState) {
      return {
        state: "idle",
        url: "",
        port: 0,
        token: "",
        logsDir: "",
        pid: process.pid,
        llamaPort,
      };
    }
    return {
      state: currentState.kind,
      url: currentState.kind === "ready"
        ? currentState.url
        : `http://127.0.0.1:${currentState.port}/`,
      port: currentState.port,
      token: currentState.token,
      logsDir: currentState.logsDir,
      details: currentState.kind === "failed" ? currentState.details : undefined,
      pid: process.pid,
      llamaPort,
    };
  };

  const applyCors = (req: http.IncomingMessage, res: http.ServerResponse) => {
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
    // Allow any chrome-extension origin — the loopback bind means only local
    // processes can hit this endpoint anyway, and the token in the payload is
    // still required to auth against the actual gateway.
    if (origin.startsWith("chrome-extension://") || allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    } else if (allowedOrigins.size === 0) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  };

  const server = http.createServer((req, res) => {
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    const url = req.url ?? "/";
    if (url.startsWith("/gateway-status")) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(buildPayload()));
      return;
    }
    if (url.startsWith("/healthz")) {
      res.statusCode = 200;
      res.end("ok");
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  const bound = await new Promise<number>((resolve, reject) => {
    server.once("error", (err) => reject(err));
    server.listen(params.preferredPort, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("failed to resolve discovery port"));
        return;
      }
      resolve(addr.port);
    });
  });

  return {
    port: bound,
    update(state) {
      currentState = state;
    },
    setLlamaPort(port) {
      llamaPort = port;
    },
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
