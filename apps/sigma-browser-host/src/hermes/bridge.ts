import * as http from "node:http";
import { randomBytes } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import type { CdpMessage, RelayFrame } from "./types";

/**
 * Two-sided CDP bridge that lets the Python Hermes Agent control the user's
 * Sigma tabs without giving Hermes any kind of direct browser access.
 *
 *  ┌─────────────────────┐ Side A (CDP)         ┌──────────────────────┐
 *  │ Python Hermes Agent │ ───── ws ──────────▶ │   hermes-launcher    │
 *  └─────────────────────┘ ◀────── ws ──────── │     (this code)       │
 *                                              │                       │
 *                                              │  CDP ↔ relay glue     │
 *                                              │                       │
 *  ┌─────────────────────┐ Side B (relay)      │                       │
 *  │ Sigma Extension     │ ◀───── ws ────────── │                       │
 *  │  CdpRelayClient     │ ───── ws ──────────▶ │                       │
 *  └─────────┬───────────┘                      └──────────────────────┘
 *            │
 *  chrome.debugger.* (Phase 1)
 *  chrome.cdp.*      (Phase 2)
 *            │
 *            ▼
 *      Active Sigma tab
 *
 * Wire format details:
 *   - Side A speaks raw CDP JSON (the same shape `chrome --remote-debugging`
 *     would speak). Hermes connects to the URL we publish via discovery
 *     (`browser.cdp_url` in hermes config.yaml). The token in the path is
 *     mandatory; without it any local process could attach.
 *   - Side B speaks the OpenClaw-style relay frame: `{cdp: <CdpMessage>}`.
 *     This matches what `cdp-relay-client.ts` already understands so we can
 *     reuse the existing extension code as-is.
 *
 * This is the v1 skeleton: messages flow through verbatim. Per-tab routing
 * (`Target.attachToTarget` etc.) is the extension's job — the bridge does
 * not interpret CDP semantics.
 */

export interface HermesCdpMockServer {
  readonly port: number;
  readonly token: string;
  readonly publicUrl: string;
  /** True iff a Hermes client is currently connected on Side A. */
  readonly hermesConnected: boolean;
  close(): Promise<void>;
}

export interface HermesRelayServer {
  readonly port: number;
  readonly token: string;
  readonly publicUrl: string;
  /** True iff the extension is currently connected on Side B. */
  readonly extensionConnected: boolean;
  close(): Promise<void>;
}

export interface HermesBridge {
  readonly cdpMock: HermesCdpMockServer;
  readonly relay: HermesRelayServer;
  close(): Promise<void>;
}

interface BridgeRouter {
  /** Forward a message coming from Hermes (Side A) toward the extension. */
  fromHermes(msg: CdpMessage): void;
  /** Forward a message coming from the extension (Side B) back to Hermes. */
  fromExtension(frame: RelayFrame): void;
  setHermesSocket(ws: WebSocket | null): void;
  setExtensionSocket(ws: WebSocket | null): void;
}

function createRouter(opts: { logPrefix: string }): BridgeRouter {
  let hermesWs: WebSocket | null = null;
  let extensionWs: WebSocket | null = null;
  /**
   * Buffer messages that arrive on one side before the other side has
   * connected. Capped to avoid OOM on a stuck launcher; we drop the oldest
   * past the cap (best-effort: a CDP client will retry on reconnect).
   */
  const MAX_BUFFER = 256;
  const pendingToExtension: CdpMessage[] = [];
  const pendingToHermes: RelayFrame[] = [];

  const drainToExtension = () => {
    if (!extensionWs || extensionWs.readyState !== WebSocket.OPEN) {return;}
    while (pendingToExtension.length > 0) {
      const msg = pendingToExtension.shift()!;
      try {
        extensionWs.send(JSON.stringify({ cdp: msg } satisfies RelayFrame));
      } catch (err) {
        console.warn(`${opts.logPrefix} relay send failed:`, err);
        return;
      }
    }
  };
  const drainToHermes = () => {
    if (!hermesWs || hermesWs.readyState !== WebSocket.OPEN) {return;}
    while (pendingToHermes.length > 0) {
      const frame = pendingToHermes.shift()!;
      try {
        hermesWs.send(JSON.stringify(frame.cdp));
      } catch (err) {
        console.warn(`${opts.logPrefix} cdp send failed:`, err);
        return;
      }
    }
  };

  return {
    fromHermes(msg) {
      if (extensionWs && extensionWs.readyState === WebSocket.OPEN) {
        try {
          extensionWs.send(JSON.stringify({ cdp: msg } satisfies RelayFrame));
        } catch (err) {
          console.warn(`${opts.logPrefix} relay send failed:`, err);
        }
        return;
      }
      if (pendingToExtension.length >= MAX_BUFFER) {pendingToExtension.shift();}
      pendingToExtension.push(msg);
    },
    fromExtension(frame) {
      if (hermesWs && hermesWs.readyState === WebSocket.OPEN) {
        try {
          hermesWs.send(JSON.stringify(frame.cdp));
        } catch (err) {
          console.warn(`${opts.logPrefix} cdp send failed:`, err);
        }
        return;
      }
      if (pendingToHermes.length >= MAX_BUFFER) {pendingToHermes.shift();}
      pendingToHermes.push(frame);
    },
    setHermesSocket(ws) {
      hermesWs = ws;
      if (ws) {drainToHermes();}
    },
    setExtensionSocket(ws) {
      extensionWs = ws;
      if (ws) {drainToExtension();}
    },
  };
}

function parseCdpJson(buf: WebSocket.RawData): CdpMessage | null {
  try {
    const text = typeof buf === "string" ? buf : Buffer.from(buf as ArrayBuffer).toString("utf8");
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {return parsed as CdpMessage;}
  } catch {
    // ignore — malformed traffic, drop frame
  }
  return null;
}

function parseRelayJson(buf: WebSocket.RawData): RelayFrame | null {
  try {
    const text = typeof buf === "string" ? buf : Buffer.from(buf as ArrayBuffer).toString("utf8");
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "cdp" in parsed) {
      return parsed as RelayFrame;
    }
  } catch {
    // ignore — malformed traffic, drop frame
  }
  return null;
}

/** Side A: WS server mocking the browser CDP root endpoint for Hermes. */
async function startCdpMockServer(params: {
  router: BridgeRouter;
  logPrefix: string;
}): Promise<HermesCdpMockServer> {
  const token = randomBytes(32).toString("base64url");
  const httpServer = http.createServer((req, res) => {
    // Hermes' CDP HTTP discovery (`/json/version`, `/json/list`) is handled
    // here. v1 returns a minimal version blob — Hermes typically only needs
    // it once on startup; everything else flows over WS.
    if (req.url === "/json/version") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          Browser: "Sigma/HermesBridge-1",
          "Protocol-Version": "1.3",
          webSocketDebuggerUrl: `ws://127.0.0.1:${(httpServer.address() as { port: number } | null)?.port ?? 0}/devtools/browser/${token}`,
        }),
      );
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (req, socket, head) => {
    const url = req.url ?? "";
    const expectedPath = `/devtools/browser/${token}`;
    if (!url.startsWith(expectedPath)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  let connected = false;
  wss.on("connection", (ws) => {
    if (connected) {
      // Phase 1: only one Hermes process at a time. Reject second connections.
      ws.close(1008, "hermes already connected");
      return;
    }
    connected = true;
    console.log(`${params.logPrefix} hermes CDP client connected`);
    params.router.setHermesSocket(ws);
    ws.on("message", (data) => {
      const msg = parseCdpJson(data);
      if (msg) {params.router.fromHermes(msg);}
    });
    const onClose = () => {
      connected = false;
      params.router.setHermesSocket(null);
      console.log(`${params.logPrefix} hermes CDP client disconnected`);
    };
    ws.on("close", onClose);
    ws.on("error", (err) => {
      console.warn(`${params.logPrefix} hermes CDP socket error:`, err);
    });
  });

  const port: number = await new Promise<number>((resolve, reject) => {
    const onError = (err: Error) => reject(err);
    httpServer.once("error", onError);
    httpServer.listen(0, "127.0.0.1", () => {
      httpServer.removeListener("error", onError);
      const addr = httpServer.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("failed to resolve cdp-mock port"));
        return;
      }
      resolve(addr.port);
    });
  });

  const publicUrl = `ws://127.0.0.1:${port}/devtools/browser/${token}`;
  console.log(`${params.logPrefix} cdp-mock listening on ${publicUrl}`);

  return {
    port,
    token,
    publicUrl,
    get hermesConnected() {return connected;},
    async close() {
      await new Promise<void>((resolve) => {
        wss.close(() => httpServer.close(() => resolve()));
      });
    },
  };
}

/** Side B: relay WS server mirroring OpenClaw's relay protocol. */
async function startRelayServer(params: {
  router: BridgeRouter;
  preferredPort: number;
  logPrefix: string;
}): Promise<HermesRelayServer> {
  const token = randomBytes(32).toString("base64url");
  const httpServer = http.createServer((req, res) => {
    res.statusCode = 404;
    res.end();
  });
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (req, socket, head) => {
    const url = req.url ?? "";
    // Relay path: /relay/<token>. The token is delivered to the extension
    // via the discovery endpoint, so MITM by other local processes is
    // gated by the same loopback bind.
    if (!url.startsWith(`/relay/${token}`)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  let connected = false;
  wss.on("connection", (ws) => {
    if (connected) {
      ws.close(1008, "extension already connected");
      return;
    }
    connected = true;
    console.log(`${params.logPrefix} extension relay connected`);
    params.router.setExtensionSocket(ws);
    ws.on("message", (data) => {
      const frame = parseRelayJson(data);
      if (frame) {params.router.fromExtension(frame);}
    });
    const onClose = () => {
      connected = false;
      params.router.setExtensionSocket(null);
      console.log(`${params.logPrefix} extension relay disconnected`);
    };
    ws.on("close", onClose);
    ws.on("error", (err) => {
      console.warn(`${params.logPrefix} extension relay socket error:`, err);
    });
  });

  const port: number = await new Promise<number>((resolve, reject) => {
    const onError = (err: Error) => reject(err);
    httpServer.once("error", onError);
    // Phase 1 uses the preferred port if free, otherwise an ephemeral one.
    // The discovery endpoint will publish whatever we end up with.
    httpServer.listen(params.preferredPort, "127.0.0.1", () => {
      httpServer.removeListener("error", onError);
      const addr = httpServer.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("failed to resolve hermes relay port"));
        return;
      }
      resolve(addr.port);
    });
    httpServer.once("error", () => {
      httpServer.listen(0, "127.0.0.1", () => {
        const addr = httpServer.address();
        if (addr && typeof addr !== "string") {resolve(addr.port);}
      });
    });
  });

  const publicUrl = `ws://127.0.0.1:${port}/relay/${token}`;
  console.log(`${params.logPrefix} relay listening on ${publicUrl}`);

  return {
    port,
    token,
    publicUrl,
    get extensionConnected() {return connected;},
    async close() {
      await new Promise<void>((resolve) => {
        wss.close(() => httpServer.close(() => resolve()));
      });
    },
  };
}

/** Bring up both sides of the bridge and wire them through a router. */
export async function startHermesBridge(params: {
  preferredRelayPort: number;
  logPrefix?: string;
}): Promise<HermesBridge> {
  const logPrefix = params.logPrefix ?? "[hermes-bridge]";
  const router = createRouter({ logPrefix });
  const cdpMock = await startCdpMockServer({ router, logPrefix });
  const relay = await startRelayServer({
    router,
    preferredPort: params.preferredRelayPort,
    logPrefix,
  });
  return {
    cdpMock,
    relay,
    async close() {
      await Promise.allSettled([cdpMock.close(), relay.close()]);
    },
  };
}
