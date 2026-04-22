import { DataConnection, Peer } from "peerjs";
import type { ConnectionMetrics, TransportAdapter } from "rollback-netcode";

export class PeerJsTransport implements TransportAdapter {
  readonly peer: Peer;
  readonly localPeerId: string;
  readonly connectedPeers = new Set<string>();

  onMessage: ((peerId: string, message: Uint8Array) => void) | null = null;
  onConnect: ((peerId: string) => void) | null = null;
  onDisconnect: ((peerId: string) => void) | null = null;
  onError: ((peerId: string | null, error: Error, context: string) => void) | null = null;

  readonly ready: Promise<string>;

  #connections = new Map<string, DataConnection>();

  constructor(localPeerId: string) {
    this.localPeerId = localPeerId;
    this.peer = new Peer(localPeerId);

    this.ready = new Promise((resolve, reject) => {
      this.peer.on("open", resolve);
      this.peer.on("error", reject);
    });

    this.peer.on("connection", (connection) => {
      this.#attachConnection(connection);
    });

    this.peer.on("error", (error) => {
      this.onError?.(null, error, "peer");
    });
  }

  async connect(peerId: string): Promise<void> {
    await this.ready;
    const existing = this.#connections.get(peerId);
    if (existing?.open) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const connection = this.peer.connect(peerId, {
        reliable: true,
        serialization: "binary",
      });
      this.#attachConnection(connection, resolve, reject);
    });
  }

  disconnect(peerId: string): void {
    const connection = this.#connections.get(peerId);
    connection?.close();
  }

  disconnectAll(): void {
    for (const peerId of [...this.#connections.keys()]) {
      this.disconnect(peerId);
    }
  }

  destroy(): void {
    this.disconnectAll();
    this.peer.destroy();
  }

  dispose(): void {
    this.destroy();
  }

  send(peerId: string, message: Uint8Array, _reliable: boolean): void {
    const connection = this.#connections.get(peerId);
    if (!connection?.open) {
      return;
    }
    connection.send(message);
  }

  broadcast(message: Uint8Array, reliable: boolean): void {
    for (const peerId of this.connectedPeers) {
      this.send(peerId, message, reliable);
    }
  }

  getConnectionMetrics(_peerId: string): ConnectionMetrics | null {
    return null;
  }

  #attachConnection(
    connection: DataConnection,
    onOpen?: () => void,
    onError?: (error: Error) => void,
  ): void {
    this.#connections.set(connection.peer, connection);

    connection.on("open", () => {
      this.connectedPeers.add(connection.peer);
      this.onConnect?.(connection.peer);
      onOpen?.();
    });

    connection.on("data", (data) => {
      let message: Uint8Array;
      if (data instanceof Uint8Array) {
        message = data;
      } else if (data instanceof ArrayBuffer) {
        message = new Uint8Array(data);
      } else if (ArrayBuffer.isView(data)) {
        message = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      } else {
        this.onError?.(connection.peer, new Error("Unsupported PeerJS payload type"), "peer-data");
        return;
      }
      this.onMessage?.(connection.peer, message);
    });

    connection.on("close", () => {
      this.connectedPeers.delete(connection.peer);
      this.#connections.delete(connection.peer);
      this.onDisconnect?.(connection.peer);
    });

    connection.on("error", (error) => {
      this.onError?.(connection.peer, error, "peer-connection");
      onError?.(error);
    });
  }
}
