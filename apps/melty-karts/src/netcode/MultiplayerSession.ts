import { createSession, Session, type Game, type PlayerId, SessionState } from "rollback-netcode";
import * as THREE from "three";
import type { ReactiveECS, ReactiveECSSnapshot } from "@melty-karts/reactive-ecs";
import { createKart } from "../Kart";
import {
  RegisteredGameMode,
  RegisteredMasterState,
  RegisteredNetworkSlot,
  MasterState,
  RegisteredKeyboardInput,
  RegisteredJoystickInput,
  RegisteredSoundEnabled,
  RegisteredOrbitEnabled,
  RegisteredAIControlled,
  RegisteredOrientation,
} from "../World";
import { generateTrack } from "../models/Track";
import { simulateKartStep } from "../systems/KartPhysicsSystem";
import { createAISystem } from "../systems/AISystem";
import { PeerJsTransport } from "./PeerJsTransport";
import { makeInviteCode, inviteCodeToId } from "./InviteCode";

type MultiplayerSnapshot = {
  status: "idle" | "hosting" | "joining" | "lobby" | "playing" | "error";
  inviteUrl: string | null;
  inviteCode: string | null;
  invitePayload: string | null;
  players: Array<{ id: string; isHost: boolean }>;
  localPlayerId: string | null;
  error: string | null;
};

type InvitePayload = {
  roomId: string;
  hostPeerId: string;
};

class MultiplayerSessionController {
  #transport: PeerJsTransport | null = null;
  #session: Session | null = null;
  #listeners = new Set<() => void>();
  #snapshot: MultiplayerSnapshot = {
    status: "idle",
    inviteUrl: null,
    inviteCode: null,
    invitePayload: null,
    players: [],
    localPlayerId: null,
    error: null,
  };
  #update: ((dt: number) => void) | undefined = undefined;

  set update(fn: ((dt: number) => void) | undefined) {
    this.#update = fn;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  getSnapshot(): MultiplayerSnapshot {
    return this.#snapshot;
  }

  get session(): Session | null {
    return this.#session;
  }

  get isActive(): boolean {
    return this.#session !== null;
  }

  hasInviteInUrl(): boolean {
    if (typeof window === "undefined") {
      return false;
    }
    return new URL(window.location.href).searchParams.has("mp");
  }

  async getInviteFromUrl(): Promise<InvitePayload | null> {
    if (typeof window === "undefined") {
      return null;
    }
    const encoded = new URL(window.location.href).searchParams.get("mp");
    if (!encoded) {
      return null;
    }
    return this.decodeInvitePayload(encoded);
  }

  async decodeInvitePayload(payload: string): Promise<InvitePayload | null> {
    // If it's 6 characters and alphanumeric, it's a short code
    if (/^[A-Z0-9]{6}$/.test(payload)) {
      const hostPeerId = await inviteCodeToId(payload, "peer");
      const roomId = await inviteCodeToId(payload, "room");
      return { hostPeerId, roomId };
    }
    try {
      return JSON.parse(atob(payload)) as InvitePayload;
    } catch {
      return null;
    }
  }

  clearInviteFromUrl(): void {
    if (typeof window === "undefined") {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("mp");
    window.history.replaceState({}, "", url.toString());
  }

  async host(ecs: ReactiveECS): Promise<void> {
    this.leave();
    ecs.set_resource(RegisteredGameMode, { mode: 1 });
    this.#setSnapshot({ status: "hosting", error: null });
    
    const inviteCode = makeInviteCode();
    const hostPeerId = await inviteCodeToId(inviteCode, "peer");
    
    const transport = new PeerJsTransport(hostPeerId);
    await transport.ready;
    const session = this.#createSession(ecs, transport);
    
    // Attempt deterministic roomId if rollback-netcode allows
    const deterministicRoomId = await inviteCodeToId(inviteCode, "room");
    let roomId: string;
    try {
      // @ts-ignore
      roomId = await session.createRoom(deterministicRoomId);
    } catch {
      roomId = await session.createRoom();
    }

    const invite = { roomId, hostPeerId: transport.localPeerId };
    const inviteUrl = new URL(window.location.href);
    inviteUrl.searchParams.set("mp", inviteCode);
    
    this.#setSnapshot({
      status: "lobby",
      inviteUrl: inviteUrl.toString(),
      inviteCode: inviteCode,
      invitePayload: inviteCode,
      localPlayerId: session.localPlayerId,
    });
    this.#syncPlayers();
  }

  async joinFromUrl(ecs: ReactiveECS): Promise<void> {
    const invite = await this.getInviteFromUrl();
    if (!invite) {
      return;
    }
    this.clearInviteFromUrl();
    await this.join(ecs, invite);
  }

  async join(ecs: ReactiveECS, invite: InvitePayload): Promise<void> {
    this.leave();
    ecs.set_resource(RegisteredGameMode, { mode: 1 });
    this.#setSnapshot({ status: "joining", error: null, inviteCode: invite.roomId, invitePayload: invite.roomId });
    const localPeerId = `melty-${Math.random().toString(36).slice(2, 10)}`;
    const transport = new PeerJsTransport(localPeerId);
    await transport.ready;
    const session = this.#createSession(ecs, transport);
    await session.joinRoom(invite.roomId, invite.hostPeerId);
    this.#setSnapshot({
      status: session.state === SessionState.Lobby ? "lobby" : "joining",
      inviteUrl: null,
      inviteCode: invite.roomId,
      invitePayload: invite.roomId,
      localPlayerId: session.localPlayerId,
    });
    this.#syncPlayers();
  }

  async joinByPayload(ecs: ReactiveECS, payload: string): Promise<void> {
    const invite = await this.decodeInvitePayload(payload);
    if (!invite) {
      this.#setSnapshot({ error: "Invalid invite code" });
      return;
    }
    await this.join(ecs, invite);
  }

  startGame(ecs: ReactiveECS): void {
    if (!this.#session?.isHost) {
      return;
    }
    this.prepareRace(ecs);
    ecs.set_resource(RegisteredMasterState, { masterState: MasterState.IN_GAME });
    this.#session.start();
    this.#setSnapshot({ status: "playing" });
  }

  leave(): void {
    this.#session?.destroy();
    this.#transport?.destroy();
    this.#session = null;
    this.#transport = null;
    this.#snapshot = {
      status: "idle",
      inviteUrl: null,
      inviteCode: null,
      players: [],
      localPlayerId: null,
      error: null,
    };
    this.#emit();
  }

  getOrderedPlayerIds(): string[] {
    if (!this.#session) {
      return [];
    }
    return [...this.#session.players.values()]
      .filter((player) => player.leaveTick == null)
      .sort((a, b) => {
        if (a.isHost !== b.isHost) {
          return a.isHost ? -1 : 1;
        }
        return a.id.localeCompare(b.id);
      })
      .map((player) => player.id);
  }

  getLocalSlot(): number {
    if (!this.#session) {
      return 0;
    }
    return Math.max(0, this.getOrderedPlayerIds().indexOf(this.#session.localPlayerId));
  }

  prepareRace(ecs: ReactiveECS): void {
    const playerIds = this.getOrderedPlayerIds();
    const { curve } = generateTrack(42);
    for (let slot = 0; slot < playerIds.length; slot++) {
      const t = 0.995;
      let offsetStart: THREE.Vector3;
      {
        let v = curve.getTangentAt(t);
        let u = v.cross(new THREE.Vector3(0, 1, 0));
        u.normalize().multiplyScalar(slot * 1.5 - (playerIds.length - 1) * 0.75);
        offsetStart = u;
      }
      const startPos = curve.getPointAt(t).add(offsetStart);
      startPos.y += 0.1;
      let playerTypeIdx = slot % 3;
      let playerType: "Melty" | "Cubey" | "Solid";
      if (playerTypeIdx == 0) {
        playerType = "Melty";
      } else if (playerTypeIdx == 1) {
        playerType = "Cubey";
      } else {
        playerType = "Solid";
      }
      createKart({
        position: startPos,
        velocity: startPos.clone().set(0, 0, 0),
        playerType,
        facingForward: true,
        reactiveEcs: ecs,
        networkSlot: slot,
      });
    }

    // Add 2 AI players in multiplayer
    const aiCount = 2;
    const aiPlayerTypes: ("Melty" | "Cubey" | "Solid")[] = ["Melty", "Cubey", "Solid"];
    for (let i = 0; i < aiCount; i++) {
      const aiT = (0.98 - (i + playerIds.length) * 0.01 + 1) % 1;
      const aiStartPos = curve.getPointAt(aiT);
      
      const tangent = curve.getTangentAt(aiT);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      const horizontalOffset = (i - 0.5) * 3.0;
      aiStartPos.add(normal.multiplyScalar(horizontalOffset));
      aiStartPos.y += 0.1;

      const aiEntityId = createKart({
        position: aiStartPos,
        velocity: new THREE.Vector3(0, 0, 0),
        playerType: aiPlayerTypes[(i + playerIds.length) % aiPlayerTypes.length],
        facingForward: true,
        reactiveEcs: ecs,
      });

      const lookDir = tangent.clone().multiplyScalar(-1);
      const lookMat = new THREE.Matrix4().lookAt(
        new THREE.Vector3(0,0,0),
        lookDir,
        new THREE.Vector3(0,1,0)
      );
      const q = new THREE.Quaternion().setFromRotationMatrix(lookMat);
      ecs.set_field(aiEntityId, RegisteredOrientation, "x", q.x);
      ecs.set_field(aiEntityId, RegisteredOrientation, "y", q.y);
      ecs.set_field(aiEntityId, RegisteredOrientation, "z", q.z);
      ecs.set_field(aiEntityId, RegisteredOrientation, "w", q.w);

      ecs.add_component(aiEntityId, RegisteredAIControlled, { targetT: aiT });
    }
  }

  buildLocalInput(ecs: ReactiveECS): Uint8Array {
    const keyboard = ecs.ecs.resource((RegisteredGameMode as unknown) as never);
    void keyboard;
    return new Uint8Array([]);
  }

  #createSession(ecs: ReactiveECS, transport: PeerJsTransport): Session {
    this.#transport = transport;

    const ignoredResources = new Set([
      RegisteredMasterState.toString(),
      RegisteredKeyboardInput.toString(),
      RegisteredJoystickInput.toString(),
      RegisteredSoundEnabled.toString(),
      RegisteredOrbitEnabled.toString(),
    ]);

    const game: Game = {
      serialize: () => new TextEncoder().encode(JSON.stringify(ecs.serialize(ignoredResources))),
      deserialize: (data) => {
        const snapshot = JSON.parse(new TextDecoder().decode(data)) as ReactiveECSSnapshot;
        ecs.deserialize(snapshot);
      },
      step: (inputs) => {
        const slotMap = new Map<number, number>();
        for (const arch of ecs.query(RegisteredNetworkSlot)) {
          const slots = arch.get_column(RegisteredNetworkSlot, "slot") as Uint8Array;
          for (let i = 0; i < arch.entity_count; i++) {
            slotMap.set(slots[i], Number(arch.entity_ids[i]));
          }
        }

        const playerIds = this.getOrderedPlayerIds();
        for (let slot = 0; slot < playerIds.length; slot++) {
          const entityId = slotMap.get(slot);
          if (entityId === undefined) {
            continue;
          }
          const input = inputs.get(playerIds[slot] as PlayerId);
          const mask = input?.[0] ?? 0;
          simulateKartStep({
            ecs,
            entityId: entityId as never,
            dt: 1 / 60,
            turnAmount: ((mask & 0b0100) ? -1 : 0) + ((mask & 0b1000) ? 1 : 0),
            upDown: false,
            downDown: false,
            actionDown: (mask & 0b0001) !== 0,
            driftDown: (mask & 0b0010) !== 0,
          });
        }

        // Simulate AI players deterministically
        const aiSystem = createAISystem(ecs);
        aiSystem.update?.(1 / 60);

        this.#update?.(1 / 60);
      },
      hash: () => ecs.hash(ignoredResources),
    };

    const session = createSession({
      game,
      transport,
      localPlayerId: transport.localPeerId as PlayerId,
      config: {
        tickRate: 60,
        maxPlayers: 4,
      },
    });

    session.on("playerJoined", () => this.#syncPlayers());
    session.on("playerLeft", () => this.#syncPlayers());
    session.on("stateChange", (nextState) => {
      if (nextState === SessionState.Lobby) {
        this.#setSnapshot({ status: "lobby" });
      } else if (nextState === SessionState.Playing) {
        this.#setSnapshot({ status: "playing" });
      }
      this.#syncPlayers();
    });
    session.on("gameStart", () => {
      ecs.set_resource(RegisteredMasterState, { masterState: MasterState.IN_GAME });
      this.#setSnapshot({ status: "playing" });
    });
    session.on("error", (error) => {
      this.#setSnapshot({ status: "error", error: error.message });
    });

    this.#session = session;
    return session;
  }

  #syncPlayers(): void {
    if (!this.#session) {
      this.#setSnapshot({ players: [] });
      return;
    }
    this.#setSnapshot({
      players: [...this.#session.players.values()]
        .filter((player) => player.leaveTick == null)
        .map((player) => ({
          id: player.id,
          isHost: player.isHost,
        })),
      localPlayerId: this.#session.localPlayerId,
    });
  }

  #setSnapshot(patch: Partial<MultiplayerSnapshot>): void {
    this.#snapshot = {
      ...this.#snapshot,
      ...patch,
    };
    this.#emit();
  }

  #emit(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

export const multiplayerSession = new MultiplayerSessionController();
