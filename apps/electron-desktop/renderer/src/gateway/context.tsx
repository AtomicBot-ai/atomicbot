import React from "react";
import { GatewayClient } from "./client";
export type {
  ConfigGetResponse,
  SessionEntry,
  SessionsListResponse,
  ModelsListResponse,
} from "./types";

type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: unknown;
};

type GatewayRpc = {
  /** Low-level client (mostly for debugging). */
  client: GatewayClient;
  /** True when the underlying WebSocket is connected. */
  connected: boolean;
  /** Request that waits briefly for auto-connect/reconnect. */
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  /** Subscribe to all gateway events. */
  onEvent: (handler: (evt: GatewayEventFrame) => void) => () => void;
};

const GatewayRpcContext = React.createContext<GatewayRpc | null>(null);

function toWsUrl(httpUrl: string): string {
  const u = new URL(httpUrl);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/";
  u.search = "";
  u.hash = "";
  return u.toString();
}

async function waitForConnected(client: GatewayClient, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (client.connected) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 75));
  }
  return client.connected;
}

/** How long to wait for the gateway to become connected before giving up (ms). */
const WAIT_CONNECTED_TIMEOUT_MS = 15_000;

export function GatewayRpcProvider({
  url,
  token,
  children,
}: {
  url: string;
  token: string;
  children: React.ReactNode;
}) {
  const [connected, setConnected] = React.useState(false);
  const listenersRef = React.useRef(new Set<(evt: GatewayEventFrame) => void>());

  const client = React.useMemo(() => {
    const wsUrl = toWsUrl(url);
    const c = new GatewayClient({
      wsUrl,
      token,
      autoReconnect: true,
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
      onEvent: (evt) => {
        for (const listener of listenersRef.current) {
          try {
            listener(evt as GatewayEventFrame);
          } catch (err) {
            console.error("[GatewayRpc] Event listener error:", err, "Event:", evt.event);
          }
        }
      },
    });
    c.start();
    return c;
  }, [url, token]);

  React.useEffect(() => {
    // Ensure we stop the previous socket when url/token changes.
    return () => {
      client.stop();
    };
  }, [client]);

  const onEvent = React.useCallback((handler: (evt: GatewayEventFrame) => void) => {
    listenersRef.current.add(handler);
    return () => {
      listenersRef.current.delete(handler);
    };
  }, []);

  const request = React.useCallback(
    async <T,>(method: string, params?: unknown): Promise<T> => {
      // Nudge the client to reconnect immediately if it's sitting in a backoff pause.
      client.nudge();
      // Wait for the gateway to connect (includes WebSocket open + handshake).
      const ok = await waitForConnected(client, WAIT_CONNECTED_TIMEOUT_MS);
      if (!ok) {
        throw new Error("gateway not connected (timeout)");
      }
      return await client.request<T>(method, params);
    },
    [client]
  );

  const value = React.useMemo<GatewayRpc>(
    () => ({ client, connected, request, onEvent }),
    [client, connected, request, onEvent]
  );

  return <GatewayRpcContext.Provider value={value}>{children}</GatewayRpcContext.Provider>;
}

export function useGatewayRpc(): GatewayRpc {
  const ctx = React.useContext(GatewayRpcContext);
  if (!ctx) {
    throw new Error("useGatewayRpc must be used within GatewayRpcProvider");
  }
  return ctx;
}

/** Like useGatewayRpc but returns null when outside GatewayRpcProvider. */
export function useGatewayRpcOrNull(): GatewayRpc | null {
  return React.useContext(GatewayRpcContext);
}
