/**
 * Minimal local type stub for the `ws` package, scoped to what
 * src/hermes/bridge.ts actually uses.
 *
 * Real types from `@types/ws` are picked up automatically once
 * `pnpm install` runs in this package. Until then, this stub keeps the
 * launcher code typechecking standalone.
 */
declare module "ws" {
  import type { IncomingMessage } from "node:http";
  import type { Duplex } from "node:stream";

  namespace WebSocket {
    type RawData = Buffer | ArrayBuffer | Buffer[] | string;
  }

  class WebSocket {
    static readonly OPEN: 1;
    static readonly CLOSED: 3;
    static readonly CLOSING: 2;
    static readonly CONNECTING: 0;
    readonly readyState: 0 | 1 | 2 | 3;
    send(data: string | Buffer | ArrayBuffer | Uint8Array): void;
    close(code?: number, reason?: string): void;
    terminate(): void;
    on(event: "message", listener: (data: WebSocket.RawData) => void): this;
    on(event: "close", listener: (code?: number, reason?: Buffer) => void): this;
    on(event: "error", listener: (err: Error) => void): this;
  }

  class WebSocketServer {
    constructor(options: { noServer?: boolean; port?: number; host?: string });
    handleUpgrade(
      req: IncomingMessage,
      socket: Duplex,
      head: Buffer,
      callback: (ws: WebSocket) => void,
    ): void;
    on(event: "connection", listener: (ws: WebSocket, req: IncomingMessage) => void): this;
    emit(event: "connection", ws: WebSocket, req: IncomingMessage): boolean;
    close(callback?: () => void): void;
  }

  export { WebSocket, WebSocketServer };
  export default WebSocket;
}
