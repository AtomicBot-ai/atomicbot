/**
 * Hermes extension-relay server (loopback only).
 *
 * Slimmed-down adaptation of `sigma-eclipse-agent/src/browser/extension-relay.ts`
 * tailored for the Hermes launcher. We can't import that module directly because
 * it pulls in OpenClaw config/secrets resolution; the public protocol however is
 * small, well-known, and shared with the extension's `cdp-relay-client.ts`.
 *
 * Wire shape:
 *
 *   ┌──────────────────────┐  /extension?token=HMAC   ┌──────────────────────┐
 *   │ Sigma Extension      │ ──────────── ws ───────▶ │   relay server       │
 *   │  CdpRelayClient      │ ◀─────────── ws ──────── │   (this file)        │
 *   └──────────────────────┘                          │                      │
 *                                                      │   target cache       │
 *                                                      │   command routing    │
 *   ┌──────────────────────┐  /cdp?token=HMAC          │                      │
 *   │ Python sigma_hermes  │ ──────────── ws ───────▶ │                      │
 *   │  shim browser_relay  │ ◀─────────── ws ──────── │                      │
 *   └──────────────────────┘                          └──────────────────────┘
 *
 * Token gating:
 *   - We mint a single random `gatewayToken` (32 bytes, base64url) per launcher
 *     run. Both endpoints accept HMAC-SHA256(gatewayToken,
 *     "openclaw-extension-relay-v1:<port>") in the `?token=` query param.
 *   - The extension's `relay-utils.ts::deriveRelayToken` and
 *     `connect.params.auth.token` flow expect this exact token.
 *
 * Phase 1 protocol on the extension socket (matches CdpRelayClient):
 *   server → ext: { type: "event", event: "connect.challenge",
 *                   payload: { nonce, ts } }
 *   ext → server: { type: "req", id, method: "connect",
 *                   params: { auth: { token: gatewayToken }, ... } }
 *   server → ext: { type: "res", id, ok: true }
 *   server → ext: { id, method: "forwardCDPCommand",
 *                   params: { method, params, sessionId } }
 *   ext → server: { id, result } | { id, error: "..." }
 *   ext → server: { method: "forwardCDPEvent",
 *                   params: { method, params, sessionId } }
 *   ext ⇄ server: { method: "ping" } / { method: "pong" }
 *
 * Phase 1 protocol on the CDP socket (raw CDP, what Python expects):
 *   client → server: { id, method, params?, sessionId? }
 *   server → client: { id, result } | { id, error: { message } }
 *   server → client: { method, params, sessionId? }   (events)
 */

import * as http from "node:http";
import { createHmac, randomBytes } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";

const RELAY_TOKEN_CONTEXT = "openclaw-extension-relay-v1";

// Verbose tracing is opt-in via env var so release builds stay quiet on
// stdout/stderr. Set SIGMA_LAUNCHER_VERBOSE=1 to re-enable.
const VERBOSE =
  process.env.SIGMA_LAUNCHER_VERBOSE === "1" ||
  process.env.SIGMA_LAUNCHER_VERBOSE === "true";

function verbose(...args: unknown[]): void {
  if (VERBOSE) {console.log(...args);}
}
const PING_INTERVAL_MS = 5_000;
const COMMAND_TIMEOUT_MS = 30_000;
// How long the relay buffers an inbound CDP command while it waits for the
// extension to (re)connect. Sized to cover the worst-case cold-start window:
//   discovery poll (≤5s) + WS upgrade + handshake.
// If the extension never shows up — really disabled, incognito, force-killed —
// the request fails honestly with "extension not connected" after this.
const EXTENSION_WAIT_MS = 5_000;

type CdpCommand = {
  id: number;
  method: string;
  params?: unknown;
  sessionId?: string;
  /** Forwarded from the Python shim: identifies which Eclipse chat this CDP
   *  command belongs to so the extension can route it to the chat's dedicated
   *  tab rather than whichever tab happens to be first-connected. */
  eclipseSessionKey?: string;
};

type CdpResponse = {
  id: number;
  result?: unknown;
  error?: { message: string };
  sessionId?: string;
};

type CdpEvent = {
  method: string;
  params?: unknown;
  sessionId?: string;
};

type ExtensionForwardCommandMessage = {
  id: number;
  method: "forwardCDPCommand";
  params: { method: string; params?: unknown; sessionId?: string; eclipseSessionKey?: string };
};

type ExtensionResponseMessage = {
  id: number;
  result?: unknown;
  error?: string;
};

type ExtensionForwardEventMessage = {
  method: "forwardCDPEvent";
  params: { method: string; params?: unknown; sessionId?: string };
};

type ExtensionMessage =
  | ExtensionResponseMessage
  | ExtensionForwardEventMessage
  | { method: "pong" }
  | { type: "req"; id: string; method: "connect"; params: { auth?: { token?: string } } };

type TargetInfo = {
  targetId: string;
  type?: string;
  title?: string;
  url?: string;
  attached?: boolean;
};

type ConnectedTarget = {
  sessionId: string;
  targetId: string;
  targetInfo: TargetInfo;
};

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
};

export interface HermesRelayServer {
  /** Public TCP port the relay HTTP/WS server is listening on. */
  readonly port: number;
  /** `gatewayToken` published in discovery (extension uses it for HMAC + auth). */
  readonly gatewayToken: string;
  /** ws://127.0.0.1:<port> — the bare base; concrete clients build subpaths. */
  readonly baseWsUrl: string;
  /** ws URL for the CDP client (Python shim). */
  readonly cdpWsUrl: string;
  /** True iff the extension is currently connected on /extension. */
  readonly extensionConnected: boolean;
  close(): Promise<void>;
}

function rawDataToString(data: unknown): string {
  if (typeof data === "string") {return data;}
  if (Buffer.isBuffer(data)) {return data.toString("utf8");}
  if (data instanceof ArrayBuffer) {return Buffer.from(data).toString("utf8");}
  if (Array.isArray(data)) {return Buffer.concat(data as Buffer[]).toString("utf8");}
  return "";
}

function deriveRelayUrlToken(gatewayToken: string, port: number): string {
  return createHmac("sha256", gatewayToken)
    .update(`${RELAY_TOKEN_CONTEXT}:${port}`)
    .digest("hex");
}

function rejectUpgrade(socket: NodeJS.WritableStream & { destroy?: () => void }, status: number, body: string): void {
  try {
    const buf = Buffer.from(body);
    socket.write(
      `HTTP/1.1 ${status} ${status === 200 ? "OK" : "ERR"}\r\n` +
        "Content-Type: text/plain; charset=utf-8\r\n" +
        `Content-Length: ${buf.length}\r\n` +
        "Connection: close\r\n\r\n",
    );
    socket.write(buf);
    socket.end();
  } catch {
    // ignore
  }
  try {socket.destroy?.();} catch {/* ignore */}
}

export async function startHermesRelayServer(params: {
  preferredPort: number;
  logPrefix?: string;
}): Promise<HermesRelayServer> {
  const logPrefix = params.logPrefix ?? "[hermes-relay]";
  const gatewayToken = randomBytes(32).toString("base64url");

  // Per-side state.
  let extensionWs: WebSocket | null = null;
  let extensionHandshakeOk = false;
  const cdpClients = new Set<WebSocket>();
  const connectedTargets = new Map<string, ConnectedTarget>();
  const pendingExtension = new Map<number, Pending>();
  // Inbound CDP commands that arrived before the extension had finished its
  // handshake. Resolved en masse from the wssExtension "connection" handler
  // once handshake succeeds; rejected by the per-waiter timeout otherwise.
  const extensionReadyWaiters: Array<() => void> = [];
  let nextExtensionId = 1;
  let pingTimer: NodeJS.Timeout | null = null;

  const extensionOpen = (): boolean =>
    extensionWs !== null && extensionWs.readyState === 1 && extensionHandshakeOk;

  const waitForExtension = (timeoutMs: number): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      let settled = false;
      const onReady = (): void => {
        if (settled) {return;}
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        if (settled) {return;}
        settled = true;
        const idx = extensionReadyWaiters.indexOf(onReady);
        if (idx >= 0) {extensionReadyWaiters.splice(idx, 1);}
        reject(new Error("timeout"));
      }, timeoutMs);
      extensionReadyWaiters.push(onReady);
    });

  const flushExtensionReadyWaiters = (): void => {
    if (extensionReadyWaiters.length === 0) {return;}
    const waiters = extensionReadyWaiters.splice(0, extensionReadyWaiters.length);
    for (const w of waiters) {
      try {w();} catch {/* ignore */}
    }
  };

  const sendToExtension = async (
    payload: ExtensionForwardCommandMessage,
  ): Promise<unknown> => {
    if (!extensionOpen()) {
      // Cold-start race: launcher just spawned us, Hermes shim is already
      // hammering CDP commands, but the extension is still in its discovery
      // poll. Buffer briefly instead of failing the user-visible tool call.
      console.log(
        `${logPrefix} buffering CDP cmd ${payload.params.method}, waiting for extension (waiters=${extensionReadyWaiters.length + 1})`,
      );
      try {
        await waitForExtension(EXTENSION_WAIT_MS);
      } catch {
        throw new Error("extension not connected");
      }
    }
    const ws = extensionWs;
    if (!ws || ws.readyState !== 1) {
      throw new Error("extension not connected");
    }
    ws.send(JSON.stringify(payload));
    return await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingExtension.delete(payload.id);
        reject(new Error(`extension request timeout: ${payload.params.method}`));
      }, COMMAND_TIMEOUT_MS);
      pendingExtension.set(payload.id, { resolve, reject, timer });
    });
  };

  const broadcastToCdpClients = (evt: CdpEvent): void => {
    if (cdpClients.size === 0) {return;}
    const msg = JSON.stringify(evt);
    for (const ws of cdpClients) {
      if (ws.readyState === 1) {
        try {ws.send(msg);} catch {/* ignore */}
      }
    }
  };

  const sendCdpResponse = (ws: WebSocket, res: CdpResponse): void => {
    if (ws.readyState !== 1) {return;}
    try {ws.send(JSON.stringify(res));} catch {/* ignore */}
  };

  /**
   * Translate a CDP method into either a local response (target-cache reads,
   * Browser-level no-ops) or a forwardCDPCommand bounce to the extension.
   * Mirrors the routing table in OpenClaw's extension-relay.ts.
   */
  const routeCdpCommand = async (cmd: CdpCommand): Promise<unknown> => {
    switch (cmd.method) {
      case "Browser.getVersion":
        return {
          protocolVersion: "1.3",
          product: "Sigma/Hermes-Relay",
          revision: "0",
          userAgent: "Sigma-Hermes-Relay",
          jsVersion: "V8",
        };
      case "Browser.setDownloadBehavior":
        return {};
      case "Target.setAutoAttach":
      case "Target.setDiscoverTargets":
        // No-op locally; the extension's own auto-attach feeds the cache via
        // forwardCDPEvent(Target.attachedToTarget) on connect.
        return {};
      case "Target.getTargets":
        return {
          targetInfos: Array.from(connectedTargets.values()).map((t) => ({
            ...t.targetInfo,
            attached: true,
          })),
        };
      case "Target.getTargetInfo": {
        const params = (cmd.params ?? {}) as { targetId?: string };
        if (params.targetId) {
          for (const t of connectedTargets.values()) {
            if (t.targetId === params.targetId) {return { targetInfo: t.targetInfo };}
          }
        }
        if (cmd.sessionId && connectedTargets.has(cmd.sessionId)) {
          const t = connectedTargets.get(cmd.sessionId);
          if (t) {return { targetInfo: t.targetInfo };}
        }
        const first = Array.from(connectedTargets.values())[0];
        return { targetInfo: first?.targetInfo };
      }
      case "Target.attachToTarget": {
        const params = (cmd.params ?? {}) as { targetId?: string };
        if (!params.targetId) {throw new Error("targetId required");}
        for (const t of connectedTargets.values()) {
          if (t.targetId === params.targetId) {return { sessionId: t.sessionId };}
        }
        throw new Error("target not found");
      }
      default: {
        const id = nextExtensionId++;
        return await sendToExtension({
          id,
          method: "forwardCDPCommand",
          params: {
            method: cmd.method,
            sessionId: cmd.sessionId,
            params: cmd.params,
            ...(cmd.eclipseSessionKey ? { eclipseSessionKey: cmd.eclipseSessionKey } : {}),
          },
        });
      }
    }
  };

  // -------------------------------------------------------------------------
  // HTTP + WS plumbing.
  // -------------------------------------------------------------------------

  const httpServer = http.createServer((req, res) => {
    // Plain-HTTP responses are handy for local debugging (curl /healthz)
    // but never strictly required by the protocol.
    const url = req.url ?? "/";
    if (url.startsWith("/healthz")) {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("ok");
      return;
    }
    if (url === "/") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("hermes-relay");
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  const wssExtension = new WebSocketServer({ noServer: true });
  const wssCdp = new WebSocketServer({ noServer: true });

  // Bind first so we know `port` for the HMAC validator.
  const port = await new Promise<number>((resolve, reject) => {
    const onError = (err: Error) => {
      httpServer.removeListener("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      httpServer.removeListener("error", onError);
      const addr = httpServer.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("failed to resolve relay port"));
        return;
      }
      resolve(addr.port);
    };
    httpServer.once("error", onError);
    httpServer.once("listening", onListening);
    httpServer.listen(params.preferredPort, "127.0.0.1");
  }).catch(async (err) => {
    if ((err as NodeJS.ErrnoException | null)?.code !== "EADDRINUSE") {throw err;}
    return await new Promise<number>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.once("listening", () => {
        const addr = httpServer.address();
        if (addr && typeof addr !== "string") {resolve(addr.port);}
        else {reject(new Error("rebind failed"));}
      });
      httpServer.listen(0, "127.0.0.1");
    });
  });

  const expectedUrlToken = deriveRelayUrlToken(gatewayToken, port);

  httpServer.on("upgrade", (req, socket, head) => {
    const fullUrl = `http://127.0.0.1:${port}${req.url ?? "/"}`;
    let parsed: URL;
    try {
      parsed = new URL(fullUrl);
    } catch {
      rejectUpgrade(socket, 400, "bad request");
      return;
    }
    const pathname = parsed.pathname;
    const queryToken = parsed.searchParams.get("token") ?? "";
    if (queryToken !== expectedUrlToken) {
      rejectUpgrade(socket, 401, "Unauthorized");
      return;
    }
    if (pathname === "/extension") {
      // MV3 worker reconnect can leave a stale non-OPEN reference.
      if (extensionWs && extensionWs.readyState !== 1) {
        try {extensionWs.terminate();} catch {/* ignore */}
        extensionWs = null;
      }
      if (extensionOpen()) {
        rejectUpgrade(socket, 409, "extension already connected");
        return;
      }
      wssExtension.handleUpgrade(req, socket, head, (ws) => {
        wssExtension.emit("connection", ws, req);
      });
      return;
    }
    if (pathname === "/cdp") {
      wssCdp.handleUpgrade(req, socket, head, (ws) => {
        wssCdp.emit("connection", ws, req);
      });
      return;
    }
    rejectUpgrade(socket, 404, "not found");
  });

  // -------------------------------------------------------------------------
  // Extension socket: handshake, command responses, event broadcasting.
  // -------------------------------------------------------------------------

  wssExtension.on("connection", (ws) => {
    extensionWs = ws;
    extensionHandshakeOk = false;
    verbose(`${logPrefix} extension connected`);

    // Step 1: connect.challenge → wait for connect.req → reply ok.
    const nonce = randomBytes(16).toString("hex");
    let handshakeOk = false;
    try {
      ws.send(
        JSON.stringify({
          type: "event",
          event: "connect.challenge",
          payload: { nonce, ts: Date.now() },
        }),
      );
    } catch {/* ignore */}

    const handshakeTimer = setTimeout(() => {
      if (!handshakeOk) {
        console.warn(`${logPrefix} extension handshake timed out`);
        try {ws.close(1008, "handshake timeout");} catch {/* ignore */}
      }
    }, 10_000);

    if (!pingTimer) {
      pingTimer = setInterval(() => {
        if (extensionOpen()) {
          try {extensionWs?.send(JSON.stringify({ method: "ping" }));} catch {/* ignore */}
        }
      }, PING_INTERVAL_MS);
    }

    ws.on("message", (raw) => {
      if (extensionWs !== ws) {return;}
      let msg: ExtensionMessage | null = null;
      try {
        msg = JSON.parse(rawDataToString(raw)) as ExtensionMessage;
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object") {return;}

      // Connect handshake reply.
      if (
        "type" in msg &&
        msg.type === "req" &&
        msg.method === "connect" &&
        typeof msg.id === "string"
      ) {
        const tok = msg.params?.auth?.token;
        if (typeof tok !== "string" || tok !== gatewayToken) {
          try {
            ws.send(
              JSON.stringify({
                type: "res",
                id: msg.id,
                ok: false,
                error: { message: "invalid auth token" },
              }),
            );
          } catch {/* ignore */}
          try {ws.close(1008, "auth failed");} catch {/* ignore */}
          return;
        }
        handshakeOk = true;
        extensionHandshakeOk = true;
        clearTimeout(handshakeTimer);
        try {
          ws.send(JSON.stringify({ type: "res", id: msg.id, ok: true }));
        } catch {/* ignore */}
        verbose(
          `${logPrefix} extension handshake ok` +
            (extensionReadyWaiters.length > 0
              ? ` (releasing ${extensionReadyWaiters.length} buffered cmd(s))`
              : ""),
        );
        flushExtensionReadyWaiters();
        return;
      }

      // Pong.
      if ("method" in msg && (msg as { method: string }).method === "pong") {return;}

      // Command response.
      if ("id" in msg && typeof (msg as { id?: unknown }).id === "number") {
        const resp = msg as ExtensionResponseMessage;
        const pending = pendingExtension.get(resp.id);
        if (!pending) {return;}
        pendingExtension.delete(resp.id);
        clearTimeout(pending.timer);
        if (typeof resp.error === "string" && resp.error.length > 0) {
          pending.reject(new Error(resp.error));
        } else {
          pending.resolve(resp.result);
        }
        return;
      }

      // forwardCDPEvent broadcast.
      if (
        "method" in msg &&
        (msg as ExtensionForwardEventMessage).method === "forwardCDPEvent"
      ) {
        const evt = msg as ExtensionForwardEventMessage;
        const method = evt.params?.method;
        const params = evt.params?.params;
        const sessionId = evt.params?.sessionId;
        if (!method || typeof method !== "string") {return;}

        if (method === "Target.attachedToTarget") {
          const attached = (params ?? {}) as {
            sessionId?: string;
            targetInfo?: TargetInfo;
          };
          if (
            attached.sessionId &&
            attached.targetInfo?.targetId &&
            (attached.targetInfo.type ?? "page") === "page"
          ) {
            connectedTargets.set(attached.sessionId, {
              sessionId: attached.sessionId,
              targetId: attached.targetInfo.targetId,
              targetInfo: attached.targetInfo,
            });
          }
        }
        if (method === "Target.detachedFromTarget") {
          const detached = (params ?? {}) as {
            sessionId?: string;
            targetId?: string;
          };
          if (detached.sessionId) {connectedTargets.delete(detached.sessionId);}
          if (detached.targetId) {
            for (const [sid, target] of connectedTargets) {
              if (target.targetId === detached.targetId) {connectedTargets.delete(sid);}
            }
          }
        }
        if (method === "Target.targetInfoChanged") {
          const changed = (params ?? {}) as { targetInfo?: TargetInfo };
          const ti = changed.targetInfo;
          if (ti?.targetId) {
            for (const [sid, target] of connectedTargets) {
              if (target.targetId === ti.targetId) {
                connectedTargets.set(sid, {
                  ...target,
                  targetInfo: { ...target.targetInfo, ...ti },
                });
              }
            }
          }
        }
        broadcastToCdpClients({ method, params, sessionId });
      }
    });

    ws.on("close", () => {
      clearTimeout(handshakeTimer);
      if (extensionWs === ws) {
        extensionWs = null;
        extensionHandshakeOk = false;
        connectedTargets.clear();
        for (const [, p] of pendingExtension) {
          clearTimeout(p.timer);
          p.reject(new Error("extension disconnected"));
        }
        pendingExtension.clear();
        console.log(`${logPrefix} extension disconnected`);
      }
    });
    ws.on("error", (err) => {
      console.warn(`${logPrefix} extension socket error:`, err);
    });
  });

  // -------------------------------------------------------------------------
  // CDP socket: raw CDP commands from Python; routed via routeCdpCommand.
  // -------------------------------------------------------------------------

  wssCdp.on("connection", (ws) => {
    cdpClients.add(ws);
    console.log(`${logPrefix} cdp client connected (clients=${cdpClients.size})`);

    // Replay attached targets so the new client sees the current world.
    for (const t of connectedTargets.values()) {
      try {
        ws.send(
          JSON.stringify({
            method: "Target.attachedToTarget",
            params: {
              sessionId: t.sessionId,
              targetInfo: { ...t.targetInfo, attached: true },
              waitingForDebugger: false,
            },
          } satisfies CdpEvent),
        );
      } catch {/* ignore */}
    }

    ws.on("message", async (raw) => {
      let cmd: CdpCommand | null = null;
      try {
        cmd = JSON.parse(rawDataToString(raw)) as CdpCommand;
      } catch {
        return;
      }
      if (!cmd || typeof cmd !== "object") {return;}
      if (typeof cmd.id !== "number" || typeof cmd.method !== "string") {return;}

      console.log(
        `${logPrefix} CDP cmd id=${cmd.id} method=${cmd.method} sessionId=${cmd.sessionId ?? "<none>"} eclipseSessionKey=${cmd.eclipseSessionKey ?? "<none>"}`,
      );

      // No early `extensionOpen()` check here on purpose: locally-handled
      // methods (Browser.getVersion, Target.getTargets etc.) succeed even
      // without an extension, and forwarded methods are gated inside
      // `sendToExtension`, which buffers up to EXTENSION_WAIT_MS.
      try {
        const result = await routeCdpCommand(cmd);
        sendCdpResponse(ws, { id: cmd.id, sessionId: cmd.sessionId, result });
      } catch (err) {
        sendCdpResponse(ws, {
          id: cmd.id,
          sessionId: cmd.sessionId,
          error: { message: err instanceof Error ? err.message : String(err) },
        });
      }
    });

    ws.on("close", () => {
      cdpClients.delete(ws);
      console.log(`${logPrefix} cdp client disconnected (clients=${cdpClients.size})`);
    });
    ws.on("error", (err) => {
      console.warn(`${logPrefix} cdp socket error:`, err);
    });
  });

  const cdpWsUrl = `ws://127.0.0.1:${port}/cdp?token=${expectedUrlToken}`;
  const baseWsUrl = `ws://127.0.0.1:${port}`;

  verbose(
    `${logPrefix} listening port=${port} extensionUrl=ws://127.0.0.1:${port}/extension cdpUrl=${cdpWsUrl}`,
  );

  return {
    port,
    gatewayToken,
    baseWsUrl,
    cdpWsUrl,
    get extensionConnected() {
      return extensionOpen();
    },
    async close() {
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      for (const [, p] of pendingExtension) {
        clearTimeout(p.timer);
        p.reject(new Error("relay shutting down"));
      }
      pendingExtension.clear();
      try {extensionWs?.close(1001, "shutting down");} catch {/* ignore */}
      for (const ws of cdpClients) {
        try {ws.close(1001, "shutting down");} catch {/* ignore */}
      }
      cdpClients.clear();
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
      wssExtension.close();
      wssCdp.close();
    },
  };
}
