import Peer, { DataConnection } from "peerjs";
import { TransportAdapter } from "rollback-netcode";

enum MessageTunnel {
  /**
   * Peer to Peer messages not seen by the rollback netcode library
   */
  PeerToPeerMessage = 0,
  /**
   * Messages seen by the rollback netcode library
   */
  NetCodeMessage = 1,
}

/**
 * The number of bytes for the tunnel switch
 */
const MESSAGE_TUNNEL_TYPE_SIZE = 1;

export class PeerJsConnections {
  readonly localPeerId: string;
  private peer: Peer;
  private connections = new Map<string, DataConnection>();
  private connectedPeers = new Set<string>();
  private buffer = new Uint8Array(1024);
  private onPeerToPeerMessage: (peer: string, message: Uint8Array) => void;
  readonly ready: Promise<string>;
  readonly transport: TransportAdapter;

  constructor(params: {
    localPeerId: string,
    onMessage: (peer: string, message: Uint8Array) => void,
  }) {
    this.localPeerId = params.localPeerId;
    this.peer = new Peer(params.localPeerId);
    this.onPeerToPeerMessage = params.onMessage;
    this.ready = new Promise((resolve, reject) => {
      this.peer.on("open", resolve);
      this.peer.on("error", reject);
    });
    this.peer.on("connection", (connection) => {
      this.attachConnection(connection);
    });
    this.peer.on("error", (error) => {
      this.onError(null, error, "peer");
    });
    //
    let peerJsConnections = this;
    this.transport = {
      async connect(peerId) {
        await peerJsConnections.connect(peerId);
      },
      disconnect(peerId) {
        peerJsConnections.connections.get(peerId)?.close();
      },
      disconnectAll() {
        for (let connection of peerJsConnections.connections.values()) {
          connection.close();
        }
      },
      send(peerId, message, reliable) {
        peerJsConnections.sendMessage2(MessageTunnel.NetCodeMessage, peerId, message);
      },
      broadcast(message, reliable) {
        peerJsConnections.broadcast2(MessageTunnel.NetCodeMessage, message);
      },
      onMessage: null,
      onConnect: null,
      onDisconnect: null,
      onError: null,
      get connectedPeers() {
        return peerJsConnections.connectedPeers;
      },
      get localPeerId() {
        return peerJsConnections.localPeerId;
      },
      getConnectionMetrics(peerId) {
        return null;
      },
      dispose() {
        this.disconnectAll();
        peerJsConnections.peer.destroy();
      },
    };
  }

  async connect(peerId: string): Promise<void> {
    await this.ready;
    let existing = this.connections.get(peerId);
    if (existing?.open) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const connection = this.peer.connect(peerId, {
        reliable: true,
        serialization: "binary",
      });
      this.attachConnection(connection, resolve, reject);
    });
  }

  private attachConnection(
    connection: DataConnection,
    onOpen?: () => void,
    onError?: (error: Error) => void,
  ): void {
    this.connections.set(connection.peer, connection);
    connection.on("open", () => {
      this.connectedPeers.add(connection.peer);
      onOpen?.();
      this.transport.onConnect?.(connection.peer);
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
        this.onError(connection.peer, new Error("Unsupported PeerJS payload type"), "peer-data");
        return;
      }
      this.onMessage(connection.peer, message);
    });
    connection.on("close", () => {
      this.connectedPeers.delete(connection.peer);
      this.connections.delete(connection.peer);
      this.transport.onDisconnect?.(connection.peer);
    });
    connection.on("error", (error) => {
      this.onError(connection.peer, error, "peer-connection");
      onError?.(error);
    });
  }

  private onMessage(peer: string, message: Uint8Array): void {
    if (message.length === 0) {
      return;
    }
    let tunnel: MessageTunnel = message[0] as MessageTunnel;
    let requiredSize = message.length - MESSAGE_TUNNEL_TYPE_SIZE;
    {
      let nextSize = this.buffer.length;
      while (requiredSize > nextSize) {
        nextSize <<= 1;
      }
      if (nextSize !== this.buffer.length) {
        this.buffer = new Uint8Array(nextSize);
      }
    }
    for (let i = 0; i < message.length-1; ++i) {
      this.buffer[i] = message[i + 1];
    }
    let message2 = new Uint8Array(this.buffer.buffer, 0, requiredSize);
    switch (tunnel) {
      case MessageTunnel.PeerToPeerMessage: {
        this.onPeerToPeerMessage(peer, message2);
        break;
      }
      case MessageTunnel.NetCodeMessage: {
        this.transport.onMessage?.(peer, message2);
        break;
      }
    }
  }

  private onError(peer: string | null, error: Error, kind: string): void {
    this.transport.onError?.(peer, error, kind);
  }

  sendMessage(peer: string, message: Uint8Array) {
    this.sendMessage2(MessageTunnel.PeerToPeerMessage, peer, message);
  }

  broadcast(message: Uint8Array) {
    this.broadcast2(MessageTunnel.PeerToPeerMessage, message);
  }

  private sendMessage2(tunnel: MessageTunnel, peer: string, message: Uint8Array) {
    let requiredSize = MESSAGE_TUNNEL_TYPE_SIZE + message.length;
    {
      let nextSize = this.buffer.length;
      while (requiredSize > nextSize) {
        nextSize <<= 1;
      }
      if (nextSize !== this.buffer.length) {
        this.buffer = new Uint8Array(nextSize);
      }
    }
    this.buffer[0] = tunnel;
    for (let i = 0; i < message.length; ++i) {
      this.buffer[i + 1] = message[i];
    }
    let dataConnection = this.connections.get(peer);
    if (dataConnection === undefined) {
      return;
    }
    dataConnection.send(new Uint8Array(this.buffer.buffer, 0, requiredSize));
  }

  private broadcast2(tunnel: MessageTunnel, message: Uint8Array) {
    let requiredSize = MESSAGE_TUNNEL_TYPE_SIZE + message.length;
    {
      let nextSize = this.buffer.length;
      while (requiredSize > nextSize) {
        nextSize <<= 1;
      }
      if (nextSize !== this.buffer.length) {
        this.buffer = new Uint8Array(nextSize);
      }
    }
    this.buffer[0] = tunnel;
    for (let i = 0; i < message.length; ++i) {
      this.buffer[i + 1] = message[i];
    }
    let message2 = new Uint8Array(this.buffer.buffer, 0, requiredSize);
    for (let peer of this.connectedPeers) {
      let dataConnection = this.connections.get(peer);
      if (dataConnection === undefined) {
        continue;
      }
      dataConnection.send(message2);
    }
  }

  destroy() {
    for (let dataConnection of this.connections.values()) {
      dataConnection.close();
    }
    this.peer.destroy();
  }
}
