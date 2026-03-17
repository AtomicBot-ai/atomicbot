type GatewayRequestFrame = {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
};

type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
    retryable?: boolean;
    retryAfterMs?: number;
  };
};

type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: unknown;
};

type GatewayFrame = GatewayRequestFrame | GatewayResponseFrame | GatewayEventFrame;

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
};

export type GatewayClientOptions = {
  wsUrl: string;
  token: string;
  onEvent?: (evt: GatewayEventFrame) => void;
  onClose?: (info: { code: number; reason: string }) => void;
  onOpen?: () => void;
  /**
   * Automatically reconnect when the socket closes unexpectedly.
   * Default: true.
   */
  autoReconnect?: boolean;
  /**
   * Initial reconnect delay in milliseconds.
   * Default: 250ms.
   */
  reconnectMinDelayMs?: number;
  /**
   * Max reconnect delay in milliseconds.
   * Default: 1000ms.
   */
  reconnectMaxDelayMs?: number;
};

export class GatewayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private nextId = 1;
  private closed = false;
  private handshakeComplete = false;
  private reconnectDelayMs = 250;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private opts: GatewayClientOptions) {}

  start() {
    this.closed = false;
    this.clearReconnectTimer();
    this.reconnectDelayMs = this.resolveReconnectMinDelayMs();
    this.connect();
  }

  stop() {
    this.closed = true;
    this.handshakeComplete = false;
    this.clearReconnectTimer();
    this.ws?.close();
    this.ws = null;
    this.flushPending(new Error("gateway client stopped"));
  }

  get connected() {
    return this.handshakeComplete && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Nudge the client to reconnect immediately if it's currently waiting
   * in a backoff pause. No-op when already connected or actively connecting.
   */
  nudge() {
    if (this.closed || this.connected) {
      return;
    }
    // If a WebSocket is already in CONNECTING state, don't interrupt it.
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      return;
    }
    // Cancel any pending backoff timer and connect right away.
    console.info("[GatewayClient] nudge: forcing immediate reconnect");
    this.clearReconnectTimer();
    this.reconnectDelayMs = this.resolveReconnectMinDelayMs();
    this.connect();
  }

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("gateway not connected");
    }
    const id = String(this.nextId++);
    const frame: GatewayRequestFrame = { type: "req", id, method, params };
    ws.send(JSON.stringify(frame));
    return await new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as unknown as (value: unknown) => void, reject });
    });
  }

  private connect() {
    if (this.closed) {
      return;
    }
    this.handshakeComplete = false;
    this.ws = new WebSocket(this.opts.wsUrl);
    this.ws.addEventListener("open", () => {
      this.reconnectDelayMs = this.resolveReconnectMinDelayMs();
      // Don't fire onOpen yet — wait for the handshake response so
      // consumers don't send requests before the gateway is ready.
      this.sendConnect();
    });
    this.ws.addEventListener("message", (ev) => this.handleMessage(String(ev.data ?? "")));
    this.ws.addEventListener("close", (ev) => {
      const reason = String(ev.reason ?? "");
      this.ws = null;
      this.handshakeComplete = false;
      this.flushPending(new Error(`gateway closed (${ev.code}): ${reason}`));
      this.opts.onClose?.({ code: ev.code, reason });
      this.scheduleReconnect();
    });
    this.ws.addEventListener("error", (ev) => {
      // Log the error for debugging; close handler will fire after this
      console.error("[GatewayClient] WebSocket error:", ev);
    });
  }

  private resolveReconnectMinDelayMs(): number {
    const value =
      typeof this.opts.reconnectMinDelayMs === "number" &&
      Number.isFinite(this.opts.reconnectMinDelayMs)
        ? Math.max(0, Math.floor(this.opts.reconnectMinDelayMs))
        : 250;
    return value;
  }

  private resolveReconnectMaxDelayMs(): number {
    const value =
      typeof this.opts.reconnectMaxDelayMs === "number" &&
      Number.isFinite(this.opts.reconnectMaxDelayMs)
        ? Math.max(0, Math.floor(this.opts.reconnectMaxDelayMs))
        : 1000;
    return value;
  }

  private shouldAutoReconnect(): boolean {
    return this.opts.autoReconnect !== false;
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.closed || !this.shouldAutoReconnect()) {
      return;
    }
    if (this.reconnectTimer) {
      return;
    }
    const delay = Math.min(this.resolveReconnectMaxDelayMs(), Math.max(0, this.reconnectDelayMs));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    // Exponential backoff with a reasonable cap.
    this.reconnectDelayMs = Math.min(this.resolveReconnectMaxDelayMs(), Math.max(250, delay * 2));
  }

  private flushPending(err: Error) {
    for (const [, p] of this.pending) {
      p.reject(err);
    }
    this.pending.clear();
  }

  private sendConnect() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const connectParams = {
      minProtocol: 1,
      maxProtocol: 9999,
      client: {
        id: "openclaw-control-ui",
        displayName: "Sigma Eclipse",
        version: "0.0.0",
        platform: "electron",
        mode: "ui",
      },
      caps: ["tool-events"],
      role: "operator",
      scopes: ["operator.admin", "operator.approvals", "operator.pairing"],
      auth: { token: this.opts.token },
    };
    const frame: GatewayRequestFrame = {
      type: "req",
      id: "connect",
      method: "connect",
      params: connectParams,
    };
    this.ws.send(JSON.stringify(frame));
  }

  private handleMessage(text: string) {
    let frame: GatewayFrame;
    try {
      frame = JSON.parse(text) as GatewayFrame;
    } catch (err) {
      console.error(
        "[GatewayClient] Failed to parse message:",
        err,
        "Raw text:",
        text.slice(0, 500)
      );
      return;
    }
    if (!frame || typeof frame !== "object") {
      return;
    }
    if (frame.type === "event") {
      this.opts.onEvent?.(frame);
      return;
    }
    if (frame.type === "res") {
      // Handle the handshake response separately — it's not in the pending map.
      if (frame.id === "connect") {
        if (frame.ok) {
          this.handshakeComplete = true;
          this.opts.onOpen?.();
        } else {
          console.error("[GatewayClient] Handshake failed:", frame.error);
          // Close the socket so the reconnect logic can retry.
          this.ws?.close();
        }
        return;
      }
      const pending = this.pending.get(frame.id);
      if (!pending) {
        return;
      }
      this.pending.delete(frame.id);
      if (frame.ok) {
        pending.resolve(frame.payload);
      } else {
        const error = frame.error ?? { code: "UNKNOWN", message: "gateway request failed" };
        console.error("[GatewayClient] Request failed:", {
          requestId: frame.id,
          error,
        });
        pending.reject(error);
      }
    }
  }
}
