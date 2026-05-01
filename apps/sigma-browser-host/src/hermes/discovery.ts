import * as http from "node:http";
import type { HermesState, HermesStatusPayload } from "./types";

/**
 * Loopback HTTP discovery server for the Hermes launcher.
 *
 *   GET /hermes-status   -> JSON HermesStatusPayload
 *   GET /healthz         -> 200 OK
 *   OPTIONS *            -> CORS preflight
 *
 * Mirrors the OpenClaw gateway discovery server in shape so the extension's
 * agent-discovery-client can poll both with one code path.
 */
export interface HermesDiscoveryServer {
  readonly port: number;
  update(state: HermesState | null): void;
  setPackInstalled(params: { installed: boolean; version?: string; sizeBytes?: number }): void;
  setLlamaPort(port: number | null): void;
  setHermesRpcUrl(url: string | null): void;
  close(): Promise<void>;
}

export async function startHermesDiscoveryServer(params: {
  preferredPort: number;
  initialState?: HermesState | null;
  initialPack?: { installed: boolean; version?: string; sizeBytes?: number };
  llamaPort?: number | null;
}): Promise<HermesDiscoveryServer> {
  let currentState: HermesState | null = params.initialState ?? null;
  let pack = params.initialPack ?? { installed: false };
  let llamaPort: number | null = params.llamaPort ?? null;
  let hermesRpcUrl: string | null = null;

  const buildPayload = (): HermesStatusPayload => {
    if (!pack.installed) {
      return {
        state: "not_installed",
        pack,
        relayUrl: "",
        relayPort: 0,
        relayToken: "",
        logsDir: currentState?.logsDir ?? "",
        pid: process.pid,
        llamaPort,
      };
    }
    if (!currentState) {
      return {
        state: "idle",
        pack,
        relayUrl: "",
        relayPort: 0,
        relayToken: "",
        logsDir: "",
        pid: process.pid,
        llamaPort,
      };
    }
    if (currentState.kind === "ready") {
      return {
        state: "ready",
        pack,
        relayUrl: currentState.relayUrl,
        relayPort: currentState.relayPort,
        relayToken: currentState.relayToken,
        hermesRpcUrl: hermesRpcUrl ?? `http://127.0.0.1:${currentState.hermesRpcPort}/`,
        logsDir: currentState.logsDir,
        pid: process.pid,
        llamaPort,
      };
    }
    if (currentState.kind === "failed") {
      return {
        state: "failed",
        pack,
        relayUrl: "",
        relayPort: currentState.relayPort,
        relayToken: currentState.relayToken,
        logsDir: currentState.logsDir,
        details: currentState.details,
        pid: process.pid,
        llamaPort,
      };
    }
    return {
      state: "starting",
      pack,
      relayUrl: "",
      relayPort: currentState.relayPort,
      relayToken: currentState.relayToken,
      logsDir: currentState.logsDir,
      pid: process.pid,
      llamaPort,
    };
  };

  const applyCors = (req: http.IncomingMessage, res: http.ServerResponse) => {
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
    if (origin.startsWith("chrome-extension://")) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    } else {
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
    if (url.startsWith("/hermes-status")) {
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

  const MAX_ATTEMPTS = 6;
  const RETRY_DELAY_MS = 250;

  const tryListen = (): Promise<number> =>
    new Promise<number>((resolve, reject) => {
      const onError = (err: NodeJS.ErrnoException) => {
        server.removeListener("listening", onListening);
        reject(err);
      };
      const onListening = () => {
        server.removeListener("error", onError);
        const addr = server.address();
        if (!addr || typeof addr === "string") {
          reject(new Error("failed to resolve hermes discovery port"));
          return;
        }
        resolve(addr.port);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(params.preferredPort, "127.0.0.1");
    });

  let bound = 0;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      bound = await tryListen();
      break;
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException | null)?.code;
      if (code !== "EADDRINUSE" || attempt === MAX_ATTEMPTS - 1) {
        throw err;
      }
      await new Promise<void>((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  if (bound === 0) {
    throw lastErr instanceof Error
      ? lastErr
      : new Error(`hermes discovery failed to bind on 127.0.0.1:${params.preferredPort}`);
  }

  return {
    port: bound,
    update(state) {
      currentState = state;
    },
    setPackInstalled(p) {
      pack = p;
    },
    setLlamaPort(port) {
      llamaPort = port;
    },
    setHermesRpcUrl(url) {
      hermesRpcUrl = url;
    },
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
