import { createSession, Session, type Game, type PlayerId, SessionState } from "rollback-netcode";

class MutableGame implements Game {
  #inner: Game;

  constructor(initial: Game) {
    this.#inner = initial;
  }

  setInner(game: Game): void {
    this.#inner = game;
  }

  serialize(): Uint8Array {
    return this.#inner.serialize();
  }

  deserialize(data: Uint8Array): void {
    this.#inner.deserialize(data);
  }

  step(inputs: Map<PlayerId, Uint8Array>): void {
    this.#inner.step(inputs);
  }

  hash(): number {
    return this.#inner.hash();
  }
}
import * as THREE from "three";
import type { ReactiveECS, ReactiveECSSnapshot } from "@melty-karts/reactive-ecs";
import { ComponentRegistry, loadEcsFromXml, obtainTrackPtNodes, generateTrackCurve, TrackEvaluator } from "@melty-karts/modelling";
import RAPIER from "@dimforge/rapier3d";
import { createKart } from "../Kart";
import {
  RegisteredGameMode,
  RegisteredMasterState,
  RegisteredNetworkSlot,
  RegisteredKartConfig,
  RegisteredPlayerConfig,
  MasterState,
  RegisteredKeyboardInput,
  RegisteredJoystickInput,
  RegisteredSoundEnabled,
  RegisteredOrbitEnabled,
  RegisteredAIControlled,
  RegisteredInputControlled,
  RegisteredOrientation,
  RegisteredRaceStats,
  RegisteredLocalPlayerPosition,
} from "../World";
import { generateTrack } from "../models/Track";
import { simulateKartStep } from "../systems/KartPhysicsSystem";
import { createAISystem } from "../systems/AISystem";
import { makeInviteCode, inviteCodeToId } from "./InviteCode";
import { placeMysteryBoxesAlongTrack } from "../systems/track-util";
import { EntityID } from "@oasys/oecs";
import { PeerJsConnections } from "./PeerJsConnections";
import { Accessor, createSignal, Setter } from "solid-js";

enum MessageType {
  SelectLevel = 0,
};

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
  readonly level: Accessor<"Procedural" | "NewLevel">;
  private setLevel: Setter<"Procedural" | "NewLevel">;
  #peerJsConnections: PeerJsConnections | null = null;
  #session: Session | null = null;
  #mutableGame: MutableGame | null = null;
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
  v2RemoteInputs: Map<number, number> = new Map();
  rapierWorld?: RAPIER.World;
  onWorldRestored?: (newWorld: RAPIER.World) => boolean;

  constructor() {
    let [ level, setLevel, ] = createSignal<"Procedural" | "NewLevel">("Procedural");
    this.level = level;
    this.setLevel = setLevel;
  }

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

  private makeSelectLevelMessage(level: "Procedural" | "NewLevel"): Uint8Array {
    let message = new Uint8Array(2);
    message[0] = MessageType.SelectLevel;
    message[1] = level === "Procedural" ? 0 : 1;
    return message;
  }

  setGameImpl(game: Game): void {
    this.#mutableGame?.setInner(game);
  }

  selectLevel(level: "Procedural" | "NewLevel") {
    let message = this.makeSelectLevelMessage(level);
    this.#peerJsConnections?.broadcast(message);
    this.setLevel(level);
  }

  private onMessage(peer: string, message: Uint8Array): void {
    let messageType = message[0] as MessageType;
    switch (messageType) {
      case MessageType.SelectLevel: {
        let level = message[1];
        let level2: "Procedural" | "NewLevel";
        switch (level) {
          case 0:
            level2 = "Procedural";
            break;
          case 1:
            level2 = "NewLevel";
            break;
          default:
            return;
        }
        this.setLevel(level2);
        break;
      }
    }
  }

  private onConnect(peer: string): void {
    if (this.#session?.isHost) {
      let message = this.makeSelectLevelMessage(this.level());
      this.#peerJsConnections?.sendMessage(peer, message);
    }
  }

  async host(ecs: ReactiveECS): Promise<void> {
    this.leave();
    ecs.setResource(RegisteredGameMode, { mode: 1 });
    this.#setSnapshot({ status: "hosting", error: null });
    
    const inviteCode = makeInviteCode();
    const hostPeerId = await inviteCodeToId(inviteCode, "peer");
    
    const peerJsConnections = new PeerJsConnections({
      localPeerId: hostPeerId,
      onMessage: (peer, message) => {
        this.onMessage(peer, message);
      },
      onConnect: (peer) => {
        this.onConnect(peer);
      },
    });
    await peerJsConnections.ready;
    const session = this.#createSession(ecs, peerJsConnections);
    
    // Attempt deterministic roomId if rollback-netcode allows
    const deterministicRoomId = await inviteCodeToId(inviteCode, "room");
    let roomId: string;
    try {
      // @ts-ignore
      roomId = await session.createRoom(deterministicRoomId);
    } catch {
      roomId = await session.createRoom();
    }

    const invite = { roomId, hostPeerId: peerJsConnections.localPeerId };
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
    ecs.setResource(RegisteredGameMode, { mode: 1 });
    this.#setSnapshot({ status: "joining", error: null, inviteCode: invite.roomId, invitePayload: invite.roomId });
    const localPeerId = `melty-${Math.random().toString(36).slice(2, 10)}`;
    const peerJsConnections = new PeerJsConnections({
      localPeerId,
      onMessage: (peer, message) => {
        this.onMessage(peer, message);
      },
      onConnect: (peer) => {
        this.onConnect(peer);
      },
    });
    await peerJsConnections.ready;
    const session = this.#createSession(ecs, peerJsConnections);
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

  async startGame(ecs: ReactiveECS, componentRegistry?: ComponentRegistry): Promise<void> {
    if (!this.#session?.isHost) {
      return;
    }
    if (this.level() === "NewLevel") {
      await this.prepareNewLevelRace(ecs, componentRegistry!);
    } else {
      this.prepareRace(ecs);
    }
    this.#session.start();
    this.#setSnapshot({ status: "playing" });
  }

  leave(): void {
    this.#session?.destroy();
    this.#peerJsConnections?.destroy();
    this.#session = null;
    this.#peerJsConnections = null;
    this.#snapshot = {
      status: "idle",
      inviteUrl: null,
      inviteCode: null,
      invitePayload: null,
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
      const kartEntityId = createKart({
        position: startPos,
        velocity: startPos.clone().set(0, 0, 0),
        playerType,
        facingForward: true,
        reactiveEcs: ecs,
        networkSlot: slot,
      });
      ecs.addComponent(kartEntityId as never, RegisteredRaceStats, { laps: -1, progress: 0, finished: 0, lastT: t, rank: 0 });
      ecs.addComponent(kartEntityId as never, RegisteredLocalPlayerPosition, { rank: 0 });
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
      ecs.setField(aiEntityId, RegisteredOrientation, "x", q.x);
      ecs.setField(aiEntityId, RegisteredOrientation, "y", q.y);
      ecs.setField(aiEntityId, RegisteredOrientation, "z", q.z);
      ecs.setField(aiEntityId, RegisteredOrientation, "w", q.w);

      ecs.addComponent(aiEntityId, RegisteredAIControlled, { targetT: aiT });
      ecs.addComponent(aiEntityId, RegisteredRaceStats, { laps: -1, progress: 0, finished: 0, lastT: aiT, rank: 0 });
    }

    // add mystery boxes
    placeMysteryBoxesAlongTrack(ecs, curve);
  }

  async prepareNewLevelRace(ecs: ReactiveECS, componentRegistry: ComponentRegistry): Promise<void> {
    const levelResponse = await fetch(/* @vite-ignore */"./levels/test-level.melty-karts-level", {
      cache: "no-cache",
    });
    const levelData = await levelResponse.text();
    loadEcsFromXml(componentRegistry, ecs, levelData);

    let trackEntityId: EntityID | undefined;
    ecs.ecs.query(componentRegistry.Track).forEach((arch) => {
      for (let i = 0; i < arch.entityCount; i++) {
        trackEntityId = arch.entityIds[i] as EntityID;
      }
    });
    let curveData: { trackEval: TrackEvaluator } | undefined;
    if (trackEntityId !== undefined) {
      let trackPtNodes = obtainTrackPtNodes({ componentRegistry, ecs, trackId: trackEntityId });
      if (trackPtNodes !== undefined) {
        curveData = generateTrackCurve({ trackPtNodes });
      }
    }

    const playerIds = this.getOrderedPlayerIds();
    for (let slot = 0; slot < playerIds.length; slot++) {
      const playerTypeIdx = slot % 3;
      let entityId = ecs.createEntity();

      let ox = 0, oy = 2 + slot, oz = 0;
      let qx = 0, qy = 0, qz = 0, qw = 1;

      if (curveData !== undefined) {
        let frame = curveData.trackEval.getFrameAt(0.0);
        let matrix = new THREE.Matrix4().makeBasis(
          frame.right,
          frame.up,
          frame.forward.clone().multiplyScalar(-1.0),
        );
        let q = new THREE.Quaternion().setFromRotationMatrix(matrix);
        ox = frame.position.x;
        oy = frame.position.y + 1.0;
        oz = frame.position.z;
        qx = q.x;
        qy = q.y;
        qz = q.z;
        qw = q.w;
      }

      ecs.addComponent(entityId, componentRegistry.Transform3D, {
        ox, oy, oz, qx, qy, qz, qw,
      });
      ecs.addComponent(entityId, componentRegistry.Velocity, { x: 0, y: 0, z: 0 });
      ecs.addComponent(entityId, componentRegistry.AngularVelocity, { x: 0, y: 0, z: 0 });
      ecs.addComponent(entityId, componentRegistry.CoyoteTime, { timeout: 0 });
      ecs.addComponent(entityId, componentRegistry.LastTransform3D, {
        ox, oy, oz, qx, qy, qz, qw,
      });
      ecs.addComponent(entityId, componentRegistry.StillTime, { time: 0 });
      ecs.addComponent(entityId, RegisteredKartConfig, { speed: 0.0 });
      ecs.addComponent(entityId, RegisteredPlayerConfig, { playerType: playerTypeIdx, facingForward: 1, useItemWasDown: 0 });
      ecs.addComponent(entityId, RegisteredInputControlled, { useItemDown: 0, upDown: 0 });
      ecs.addComponent(entityId, RegisteredNetworkSlot, { slot });
    }
  }

  buildLocalInput(ecs: ReactiveECS): Uint8Array {
    if (this.level() === "NewLevel") {
      const keyboard = ecs.ecs.resource(RegisteredKeyboardInput);
      const joystick = ecs.ecs.resource(RegisteredJoystickInput);
      let mask = 0;
      if (keyboard.upDown !== 0 || joystick.joystickY < -0.2) mask |= 0b00001;
      if (keyboard.downDown !== 0 || joystick.joystickY > 0.2) mask |= 0b00010;
      if (keyboard.leftDown !== 0 || joystick.joystickX < -0.2) mask |= 0b00100;
      if (keyboard.rightDown !== 0 || joystick.joystickX > 0.2) mask |= 0b01000;
      if (keyboard.actionDown !== 0) mask |= 0b10000;
      return new Uint8Array([mask]);
    }
    const keyboard = ecs.ecs.resource((RegisteredGameMode as unknown) as never);
    void keyboard;
    return new Uint8Array([]);
  }

  #createSession(ecs: ReactiveECS, peerJsConnections: PeerJsConnections): Session {
    this.#peerJsConnections = peerJsConnections;

    const ignoredResources = new Set([
      RegisteredMasterState.toString(),
      RegisteredKeyboardInput.toString(),
      RegisteredJoystickInput.toString(),
      RegisteredSoundEnabled.toString(),
      RegisteredOrbitEnabled.toString(),
    ]);

    const game: Game = {
      serialize: () => {
        const ecsJson = JSON.stringify(ecs.serialize(ignoredResources));
        const ecsBytes = new TextEncoder().encode(ecsJson);
        if (this.rapierWorld) {
          const rapierData = this.rapierWorld.takeSnapshot();
          const combined = new Uint8Array(4 + rapierData.length + ecsBytes.length);
          const dv = new DataView(combined.buffer, combined.byteOffset, combined.byteLength);
          dv.setUint32(0, rapierData.length, true);
          combined.set(rapierData, 4);
          combined.set(ecsBytes, 4 + rapierData.length);
          return combined;
        }
        return ecsBytes;
      },
      deserialize: (data) => {
        if (data.length > 4) {
          const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
          const rapierLen = dv.getUint32(0, true);
          if (rapierLen > 0 && rapierLen < 100000000 && 4 + rapierLen < data.length) {
            const rapierData = data.slice(4, 4 + rapierLen);
            const ecsBytes = data.slice(4 + rapierLen);
            const newWorld = RAPIER.World.restoreSnapshot(rapierData);
            if (!newWorld) {
              const snapshot = JSON.parse(new TextDecoder().decode(ecsBytes)) as ReactiveECSSnapshot;
              ecs.deserialize(snapshot);
              return;
            }
            const accepted = this.onWorldRestored?.(newWorld) ?? true;
            if (accepted) {
              this.rapierWorld = newWorld;
            } else {
              newWorld.free();
            }
            const snapshot = JSON.parse(new TextDecoder().decode(ecsBytes)) as ReactiveECSSnapshot;
            ecs.deserialize(snapshot);
            return;
          }
        }
        const snapshot = JSON.parse(new TextDecoder().decode(data)) as ReactiveECSSnapshot;
        ecs.deserialize(snapshot);
      },
      step: (inputs) => {
        if (this.level() === "NewLevel") {
          const slotMap = new Map<number, number>();
          for (const arch of ecs.query(RegisteredNetworkSlot)) {
            const slots = arch.getColumnRead(RegisteredNetworkSlot, "slot") as Uint8Array;
            for (let i = 0; i < arch.entityCount; i++) {
              slotMap.set(slots[i], Number(arch.entityIds[i]));
            }
          }

          const playerIds = this.getOrderedPlayerIds();
          for (let slot = 0; slot < playerIds.length; slot++) {
            const entityId = slotMap.get(slot) as EntityID;
            if (entityId === undefined) continue;

            const input = inputs.get(playerIds[slot] as PlayerId);
            const mask = input?.[0] ?? 0;
            this.v2RemoteInputs.set(Number(entityId), mask);
          }

          this.#update?.(1 / 60);
        } else {
          const slotMap = new Map<number, number>();
          for (const arch of ecs.query(RegisteredNetworkSlot)) {
            const slots = arch.getColumnRead(RegisteredNetworkSlot, "slot") as Uint8Array;
            for (let i = 0; i < arch.entityCount; i++) {
              slotMap.set(slots[i], Number(arch.entityIds[i]));
            }
          }

          const playerIds = this.getOrderedPlayerIds();
          for (let slot = 0; slot < playerIds.length; slot++) {
            const entityId = slotMap.get(slot) as EntityID;
            if (entityId === undefined) {
              continue;
            }

            if (ecs.entity(entityId as never).hasComponent(RegisteredAIControlled)) {
              continue;
            }

            const input = inputs.get(playerIds[slot] as PlayerId);
            const mask = input?.[0] ?? 0;
            const useItemDown = (mask & 0b010000) !== 0;
            const upDown = (mask & 0b100000) !== 0;

            if (ecs.entity(entityId).hasComponent(RegisteredInputControlled)) {
              ecs.setField(entityId, RegisteredInputControlled, "useItemDown", useItemDown ? 1 : 0);
              ecs.setField(entityId, RegisteredInputControlled, "upDown", upDown ? 1 : 0);
            }

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
        }
      },
      hash: () => ecs.hash(ignoredResources),
    };

    const mutableGame = new MutableGame(game);
    this.#mutableGame = mutableGame;

    const session = createSession({
      game: mutableGame,
      transport: peerJsConnections.transport,
      localPlayerId: peerJsConnections.localPeerId as PlayerId,
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
      const state = this.level() === "NewLevel" ? MasterState.IN_GAME_V2 : MasterState.IN_GAME;
      ecs.setResource(RegisteredMasterState, { masterState: state });
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
