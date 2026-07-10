import { ReactiveECS, type ReactiveECSSnapshot } from "@melty-karts/reactive-ecs";
import { System } from "./System";
import { CatmullRomCurve4, ComponentRegistry, entityGetComponentData, generateTrackCurve, obtainTrackPtNodes, RenderTrack, ShowAll, TrackState, TrackEvaluator, transformGetMatrix } from "@melty-karts/modelling";
import { Accessor, Component, createEffect, createMemo, createSignal, For, getOwner, mapArray, Match, onCleanup, onSettled, runWithOwner, Switch, untrack } from "solid-js";
import * as THREE from "three";
import { EntityID } from "@oasys/oecs";
import type { ComponentDef } from "@oasys/oecs";
import { Canvas, Entity, useFrame } from "solid-three";
import { WebGPURenderer } from "three/webgpu";
import RAPIER from "@dimforge/rapier3d-deterministic";
import { DynamicRayCastVehicleController } from "@dimforge/rapier3d-deterministic/control";
import { type Game, type PlayerId } from "rollback-netcode";
import { T } from "../t";
import { createKart } from "../Kart";
import { RegisteredFreeEntity, RegisteredGameMode, RegisteredJoystickInput, RegisteredKartConfig, RegisteredKeyboardInput, RegisteredMasterState, RegisteredNetworkSlot, RegisteredOrientation, RegisteredPlayerConfig, RegisteredPosition, RegisteredSoundEnabled, RegisteredVelocity, RegisteredOrbitEnabled, RegisteredAIControlled, RegisteredInputControlled, RegisteredRaceStats, RegisteredLocalPlayerPosition } from "../World";
import { multiplayerSession } from "../netcode/MultiplayerSession";
import { loadKartModel } from "../models/Kart";
import Melty from "../models/melty";
import { createCubey } from "../models/cubey";
import { createSolidLogo } from "../models/SolidLogo";
import { OrbitControls } from "three-stdlib";
import { Joystick } from "../Joystick";
import { ActionButton } from "../ActionButton";
import { raceMusicRainbowWay } from "../Music";
import Ufo from "../models/Ufo";
import { UFO_BEAMING_TIMEOUT, UFO_FLY_OFF_TIMEOUT, UfoStage } from "@melty-karts/modelling/src/components/ufo-component";
import { getFreeEntityOrCreate } from "../util";
import { COYOTE_TIMEOUT } from "@melty-karts/modelling/src/components/coyote-time-component";

const SHOW_DEBUG_MESH = false;

function findKartEntityForSlot(ecs: ReactiveECS, slot: number): number {
  for (const arch of ecs.query(RegisteredNetworkSlot)) {
    const slots = arch.getColumnRead(RegisteredNetworkSlot, "slot") as Uint8Array;
    for (let i = 0; i < arch.entityCount; i++) {
      if (slots[i] === slot) {
        return arch.entityIds[i] as number;
      }
    }
  }
  throw new Error(`Could not find kart entity for multiplayer slot ${slot}`);
}

class RapierDebugRenderer {
  mesh: THREE.LineSegments;
  world: RAPIER.World;
  enabled = true;

  constructor(scene: THREE.Scene, world: RAPIER.World) {
    this.world = world;
    this.mesh = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x00ff00, vertexColors: true }),
    );
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update() {
    if (this.enabled) {
      const { vertices, colors } = this.world.debugRender();
      this.mesh.geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      this.mesh.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));
      this.mesh.visible = true;
    } else {
      this.mesh.visible = false;
    }
  }
}

function computeArcWeights(curve: CatmullRomCurve4): number[] {
  let numSamples = 400;
  let arcWeights: number[] = [0.0];
  let atWeight = 0.0;
  let v4 = new THREE.Vector4();
  let lastPt = new THREE.Vector3();
  let pt = new THREE.Vector3();
  curve.getPoint(0, v4);
  lastPt.set(v4.x, v4.y, v4.z);
  for (let i = 1; i <= numSamples; ++i) {
    let t = i / numSamples;
    curve.getPoint(t, v4);
    pt.set(v4.x, v4.y, v4.z);
    let d = lastPt.distanceTo(pt);
    atWeight += d;
    arcWeights.push(atWeight);
    lastPt.copy(pt);
  }
  for (let i = 0; i < arcWeights.length; ++i) {
    arcWeights[i] /= atWeight;
  }
  return arcWeights;
}

function generateTrackCollisionVerticesInRange(
  trackEval: TrackEvaluator,
  trackWidth: number,
  numSegments: number,
  arcWeights: number[],
  segStart: number,
  segEnd: number,
): { vertices: number[]; indices: number[] } {
  const halfWidth = trackWidth / 2;
  const segments = numSegments;
  const numPts = segEnd - segStart + 1;
  const wallHeight = 1.5;
  const wallThickness = 0.15;
  const wallLeanOutward = 0.2;
  const wallOverlap = 0.2;
  const hw = halfWidth - wallOverlap;

  let remapTValueViaWeights = (x: number): number => {
    let lo = 0;
    let hi = arcWeights.length - 1;
    while (lo < hi - 1) {
      let mid = (lo + hi) >> 1;
      if (arcWeights[mid] < x) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    let a = arcWeights[lo];
    let b = arcWeights[hi];
    let t = (x - a) / (b - a);
    let c = lo / (arcWeights.length - 1);
    let d = hi / (arcWeights.length - 1);
    return c + t * (d - c);
  };

  const vertices: number[] = [];

  for (let i = segStart; i <= segEnd; i++) {
    let t = i / segments;
    if (t === 1.0) {
      t = 0.0;
    }
    t = remapTValueViaWeights(t);
    const f = trackEval.getFrameAt(t);
    const lx = f.position.x - hw * f.right.x;
    const ly = f.position.y - hw * f.right.y;
    const lz = f.position.z - hw * f.right.z;
    const rx = f.position.x + hw * f.right.x;
    const ry = f.position.y + hw * f.right.y;
    const rz = f.position.z + hw * f.right.z;
    vertices.push(lx, ly, lz, rx, ry, rz);
  }

  for (let i = segStart; i <= segEnd; i++) {
    let t = i / segments;
    if (t === 1.0) {
      t = 0.0;
    }
    t = remapTValueViaWeights(t);
    const f = trackEval.getFrameAt(t);
    vertices.push(
      f.position.x - (hw + wallLeanOutward) * f.right.x + wallHeight * f.up.x,
      f.position.y - (hw + wallLeanOutward) * f.right.y + wallHeight * f.up.y,
      f.position.z - (hw + wallLeanOutward) * f.right.z + wallHeight * f.up.z,
      f.position.x + (hw + wallLeanOutward) * f.right.x + wallHeight * f.up.x,
      f.position.y + (hw + wallLeanOutward) * f.right.y + wallHeight * f.up.y,
      f.position.z + (hw + wallLeanOutward) * f.right.z + wallHeight * f.up.z,
    );
  }

  for (let i = segStart; i <= segEnd; i++) {
    let t = i / segments;
    if (t === 1.0) {
      t = 0.0;
    }
    t = remapTValueViaWeights(t);
    const f = trackEval.getFrameAt(t);
    const lx = f.position.x - (hw + wallThickness) * f.right.x;
    const ly = f.position.y - (hw + wallThickness) * f.right.y;
    const lz = f.position.z - (hw + wallThickness) * f.right.z;
    const rx = f.position.x + (hw + wallThickness) * f.right.x;
    const ry = f.position.y + (hw + wallThickness) * f.right.y;
    const rz = f.position.z + (hw + wallThickness) * f.right.z;
    vertices.push(lx, ly, lz, rx, ry, rz);
  }

  for (let i = segStart; i <= segEnd; i++) {
    let t = i / segments;
    if (t === 1.0) {
      t = 0.0;
    }
    t = remapTValueViaWeights(t);
    const f = trackEval.getFrameAt(t);
    vertices.push(
      f.position.x - (hw + wallThickness + wallLeanOutward) * f.right.x + wallHeight * f.up.x,
      f.position.y - (hw + wallThickness + wallLeanOutward) * f.right.y + wallHeight * f.up.y,
      f.position.z - (hw + wallThickness + wallLeanOutward) * f.right.z + wallHeight * f.up.z,
      f.position.x + (hw + wallThickness + wallLeanOutward) * f.right.x + wallHeight * f.up.x,
      f.position.y + (hw + wallThickness + wallLeanOutward) * f.right.y + wallHeight * f.up.y,
      f.position.z + (hw + wallThickness + wallLeanOutward) * f.right.z + wallHeight * f.up.z,
    );
  }

  const indices: number[] = [];
  for (let i = 0; i < numPts - 1; i++) {
    const sL0 = i * 2, sR0 = i * 2 + 1;
    const sL1 = (i + 1) * 2, sR1 = (i + 1) * 2 + 1;
    const wL0 = 2 * numPts + i * 2, wR0 = 2 * numPts + i * 2 + 1;
    const wL1 = 2 * numPts + (i + 1) * 2, wR1 = 2 * numPts + (i + 1) * 2 + 1;
    const bL0 = 4 * numPts + i * 2, bR0 = 4 * numPts + i * 2 + 1;
    const bL1 = 4 * numPts + (i + 1) * 2, bR1 = 4 * numPts + (i + 1) * 2 + 1;
    const xL0 = 6 * numPts + i * 2, xR0 = 6 * numPts + i * 2 + 1;
    const xL1 = 6 * numPts + (i + 1) * 2, xR1 = 6 * numPts + (i + 1) * 2 + 1;
    indices.push(sL0, sL1, sR0);
    indices.push(sL1, sR1, sR0);
    indices.push(sL0, wL0, sL1);
    indices.push(wL0, wL1, sL1);
    indices.push(sR0, sR1, wR0);
    indices.push(sR1, wR1, wR0);
    indices.push(bL0, bL1, xL0);
    indices.push(bL1, xL1, xL0);
    indices.push(bR0, bR1, xR0);
    indices.push(bR1, xR1, xR0);
    indices.push(wL0, xL0, wL1);
    indices.push(xL0, xL1, wL1);
    indices.push(wR0, wR1, xR0);
    indices.push(wR1, xR1, xR0);
  }

  return { vertices, indices };
}

function generateTrackCollisionVertices(
  trackEval: TrackEvaluator,
  trackWidth: number,
  numSegments: number,
  curve: CatmullRomCurve4,
): { vertices: number[]; indices: number[] } {
  let arcWeights = computeArcWeights(curve);
  return generateTrackCollisionVerticesInRange(trackEval, trackWidth, numSegments, arcWeights, 0, numSegments);
}

function createTrackBody(
  world: RAPIER.World,
  trackEval: TrackEvaluator,
  trackWidth: number,
  numSegments: number,
  curve: CatmullRomCurve4,
): { body: RAPIER.RigidBody, minY: number, } {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  let arcWeights = computeArcWeights(curve);
  const numParts = 10;
  const segsPerPart = numSegments / numParts;
  let minY = Number.POSITIVE_INFINITY;
  for (let p = 0; p < numParts; p++) {
    const segStart = Math.round(p * segsPerPart);
    const segEnd = Math.round((p + 1) * segsPerPart);
    const { vertices, indices } = generateTrackCollisionVerticesInRange(trackEval, trackWidth, numSegments, arcWeights, segStart, segEnd);
    for (let i = 0; i < vertices.length; i += 3) {
      minY = Math.min(minY, vertices[i + 1]);
    }
    const collider = RAPIER.ColliderDesc.trimesh(
      new Float32Array(vertices),
      new Uint32Array(indices),
    );
    world.createCollider(collider, body);
  }
  return { body, minY, };
}

export function createInGameSystemV2(
  componentRegistry: ComponentRegistry,
  ecs: ReactiveECS,
): System {
  const isMultiplayer = ecs.resource(RegisteredGameMode).get("mode") === 1 && multiplayerSession.isActive;
  raceMusicRainbowWay.play();
  onCleanup(() => {
    raceMusicRainbowWay.stop();
    currentWorld.free();
  });
  let currentWorld: RAPIER.World = new RAPIER.World({ x: 0, y: -9.82, z: 0 });
  if (isMultiplayer) {
    multiplayerSession.rapierWorld = currentWorld;
  }
  let trackIds = ecs.createQueryEntityIds(componentRegistry.Track);
  let trackId = createMemo(() => {
    let trackIds2 = trackIds();
    if (trackIds2.length === 0) {
      return undefined;
    }
    return trackIds2[0];
  });
  let track = createMemo(() => {
    let result: {
      entityId: EntityID,
      track: TrackState,
    } | undefined = undefined;
    let entityId = trackId();
    if (entityId === undefined) {
      return;
    }
    let trackState = entityGetComponentData(ecs, entityId, componentRegistry.Track);
    if (trackState === undefined) {
      return;
    }
    if (result !== undefined) {
      return undefined;
    }
    result = {
      entityId,
      track: trackState
    };
    return result;
  });
  let trackPtNodes = createMemo(() => {
    let trackId = track()?.entityId;
    if (trackId === undefined) {
      return undefined;
    }
    return obtainTrackPtNodes({
      componentRegistry,
      ecs,
      trackId,
    })
  });
  let curve = createMemo(() => {
    let trackPtNodes2 = trackPtNodes();
    if (trackPtNodes2 === undefined) {
      return undefined;
    }
    return generateTrackCurve({
      trackPtNodes: trackPtNodes2,
    });
  });
  let [ scene, setScene ] = createSignal<THREE.Scene>();
  let [ camera, setCamera, ] = createSignal<THREE.Camera>();
  let [ playerId, setPlayerId, ] = createSignal<EntityID>();
  let [ start, setStart, ] = createSignal<boolean>(false);
  setTimeout(() => { setStart(true); }, 500);
  let updateKeyboardInput = (params: {
    upDown?: boolean,
    downDown?: boolean,
    leftDown?: boolean,
    rightDown?: boolean,
    actionDown?: boolean,
  }) => {
    let s = { ...ecs.ecs.resources.get(RegisteredKeyboardInput) };
    if (params.upDown !== undefined) s.upDown = params.upDown ? 1 : 0;
    if (params.downDown !== undefined) s.downDown = params.downDown ? 1 : 0;
    if (params.leftDown !== undefined) s.leftDown = params.leftDown ? 1 : 0;
    if (params.rightDown !== undefined) s.rightDown = params.rightDown ? 1 : 0;
    if (params.actionDown !== undefined) s.actionDown = params.actionDown ? 1 : 0;
    ecs.setResource(RegisteredKeyboardInput, s);
  };
  let keyDownListener = (e: KeyboardEvent) => {
    if (e.key === "ArrowUp") updateKeyboardInput({ upDown: true });
    else if (e.key === "ArrowDown") updateKeyboardInput({ downDown: true });
    else if (e.key === "ArrowLeft") updateKeyboardInput({ leftDown: true });
    else if (e.key === "ArrowRight") updateKeyboardInput({ rightDown: true });
    else if (e.key === " ") updateKeyboardInput({ actionDown: true });
  };
  let keyUpListener = (e: KeyboardEvent) => {
    if (e.key === "ArrowUp") updateKeyboardInput({ upDown: false });
    else if (e.key === "ArrowDown") updateKeyboardInput({ downDown: false });
    else if (e.key === "ArrowLeft") updateKeyboardInput({ leftDown: false });
    else if (e.key === "ArrowRight") updateKeyboardInput({ rightDown: false });
    else if (e.key === " ") updateKeyboardInput({ actionDown: false });
  };
  document.addEventListener("keydown", keyDownListener);
  document.addEventListener("keyup", keyUpListener);
  onCleanup(() => {
    document.removeEventListener("keydown", keyDownListener);
    document.removeEventListener("keyup", keyUpListener);
  });
  // Drive rollback netcode tick in multiplayer mode (like RollbackNetcodeSystem does for V1)
  if (isMultiplayer) {
    const session = multiplayerSession.session;
    if (session) {
      let frameHandle = 0;
      let accumulator = 0;
      let lastTime = performance.now();
      const tickMs = 1000 / 60;
      let disposed = false;
      const frame = () => {
        if (disposed) return;
        const now = performance.now();
        accumulator += Math.min(now - lastTime, 250);
        lastTime = now;
        while (accumulator >= tickMs) {
          session.tick(multiplayerSession.buildLocalInput(ecs));
          accumulator -= tickMs;
        }
        frameHandle = requestAnimationFrame(frame);
      };
      frameHandle = requestAnimationFrame(frame);
      onCleanup(() => {
        disposed = true;
        cancelAnimationFrame(frameHandle);
      });
    }
    multiplayerSession.onWorldRestored = (newWorld) => {
      if (!newWorld) {
        return false;
      }
      const kpList = kartsWithPhysics();
      for (const kp of kpList) {
        if (!newWorld.bodies.contains(kp.chassisHandle)) {
          throw new Error(`New world did not contain expected chassis handle ${kp.chassisHandle}`);
        }
      }
      const oldWorld = currentWorld;
      for (const kp of kpList) {
        // Destroy old vehicle controller (removes from set AND frees WASM memory)
        oldWorld.removeVehicleController(kp.vehicle);
      }
      for (const kp of kpList) {
        const newChassis = newWorld.getRigidBody(kp.chassisHandle);
        // Create new vehicle controller with clean internal state
        const newVehicle = newWorld.createVehicleController(newChassis);
        newVehicle.indexUpAxis = 1;
        newVehicle.setIndexForwardAxis = 2;
        kp.wheelPositions.forEach((pos, i) => {
          newVehicle.addWheel(
            RAPIER.VectorOps.new(pos.x, pos.y, pos.z),
            RAPIER.VectorOps.new(0, -1, 0),
            RAPIER.VectorOps.new(-1, 0, 0),
            kp.suspensionRestLength,
            kp.wheelRadius
          );
          newVehicle.setWheelFrictionSlip(i, 3.5);
          let isFront = i <= 1;
          newVehicle.setWheelSuspensionStiffness(i, isFront ? 22 : 18);
          newVehicle.setWheelSuspensionCompression(i, isFront ? 28 : 28);
          newVehicle.setWheelSuspensionRelaxation(i, isFront ? 30 : 28);
          newVehicle.setWheelMaxSuspensionForce(i, 2000);
          newVehicle.setWheelMaxSuspensionTravel(i, 0.6);
        });
        kp.vehicle = newVehicle;
        const cached = kartPhysicsCache.get(kp.kartEntityId);
        if (cached) cached.vehicle = newVehicle;
      }
      currentWorld = newWorld;
      multiplayerSession.rapierWorld = newWorld;
      if (rapierDebugRenderer) rapierDebugRenderer.world = newWorld;
      oldWorld.free();
      return true;
    };
  }
  let trackMinY: number = Number.NEGATIVE_INFINITY;
  // Synchronously create track body before first tick so karts don't fall through
  // the empty world while waiting for the SolidJS effect to fire at ~500ms.
  {
    let trackEntityId: EntityID | undefined;
    const oecsQuery = ecs.ecs.query(componentRegistry.Track);
    for (let i = 0; i < oecsQuery.archetypeCount; i++) {
      const arch = oecsQuery.archetypes[i];
      for (let j = 0; j < arch.entityCount; j++) {
        trackEntityId = arch.entityIds[j] as EntityID;
      }
    }
    if (trackEntityId !== undefined) {
      let trackPtNodesData = obtainTrackPtNodes({ componentRegistry, ecs, trackId: trackEntityId });
      if (trackPtNodesData !== undefined) {
        let curveData = generateTrackCurve({ trackPtNodes: trackPtNodesData });
        if (curveData !== undefined) {
          let trackState = entityGetComponentData(ecs, trackEntityId, componentRegistry.Track) as TrackState | undefined;
          trackMinY = createTrackBody(
            currentWorld,
            curveData.trackEval,
            trackState?.width ?? 8,
            500,
            curveData.curve,
          ).minY;
        }
      }
    }
  }
  createEffect(
    () => [ track(), curve(), start() ] as const,
    ([ track, curve, start, ]) => {
      if (!start) {
        return;
      }
      if (track === undefined) {
        return;
      }
      if (curve === undefined) {
        return;
      }
      if (trackMinY === Number.NEGATIVE_INFINITY) {
        trackMinY = createTrackBody(currentWorld, curve.trackEval, track.track.width, 500, curve.curve).minY;
      }
      let playerId2: EntityID;
      if (isMultiplayer) {
        let slot = multiplayerSession.getLocalSlot();
        playerId2 = findKartEntityForSlot(ecs, slot) as EntityID;
        camera()?.position.set(2, 2, 2).add(
          curve.trackEval.getFrameAt(0.0).position
        );
      } else {
        let frame = curve.trackEval.getFrameAt(0.0);
        camera()?.position.set(2, 2, 2).add(frame.position);
        let matrix = new THREE.Matrix4().makeBasis(
          frame.right,
          frame.up,
          frame.forward.clone().multiplyScalar(-1.0),
        );
        let q = new THREE.Quaternion().setFromRotationMatrix(matrix);
        playerId2 = ecs.spawn();
        {
          let ox = frame.position.x;
          let oy = frame.position.y + 0.5;
          let oz = frame.position.z;
          let qx = q.x;
          let qy = q.y;
          let qz = q.z;
          let qw = q.w;
          ecs.addComponent(playerId2, componentRegistry.Transform3D, {
            ox, oy, oz, qx, qy, qz, qw,
          });
          ecs.addComponent(playerId2, componentRegistry.LastTransform3D, {
            ox, oy, oz, qx, qy, qz, qw,
          });
        }
        ecs.addComponent(playerId2, componentRegistry.Velocity, { x: 0.0, y: 0.0, z: 0.0, });
        ecs.addComponent(playerId2, componentRegistry.AngularVelocity, { x: 0.0, y: 0.0, z: 0.0, });
        ecs.addComponent(playerId2, componentRegistry.StillTime, { time: 0.0, });
        ecs.addComponent(playerId2, componentRegistry.CoyoteTime, { timeout: 0.0, });
        ecs.addComponent(playerId2, RegisteredPlayerConfig, {
          playerType: 0,
          facingForward: 1,
          useItemWasDown: 0,
        });
        ecs.addComponent(playerId2, RegisteredKartConfig, {
          speed: 0.0,
        });
        onCleanup(() => {
          ecs.despawn(playerId2);
        });
      }
      setPlayerId(playerId2);
    },
  );
  let ufoEntityIds = ecs.createQueryEntityIds(componentRegistry.Ufo, componentRegistry.Transform3D);
  let wheelMeshGroup = new THREE.Group();
  let kartEntityIds = ecs.createQueryEntityIds(
    RegisteredKartConfig,
    componentRegistry.Transform3D,
    componentRegistry.Velocity,
    componentRegistry.AngularVelocity,
    componentRegistry.CoyoteTime,
  );
  let kartPhysicsCache = new Map<EntityID, {
    vehicle: DynamicRayCastVehicleController;
    chassisHandle: number;
    wheelPositions: { x: number; y: number; z: number }[];
    wheelRadius: number;
    suspensionRestLength: number;
    wheelAxleDirs: { x: number; y: number; z: number }[];
    currentSteering: number;
  }>();
  let kartsWithPhysics = createMemo(mapArray(
    kartEntityIds,
    (kartEntityId) => {
      let kartEntityId2 = untrack(kartEntityId);
      const wheelRadius = 0.25;
      const wheelPositions = [
        { x: -0.4, y: 0.35, z: 0.4 },
        { x: 0.4, y: 0.35, z: 0.4 },
        { x: -0.4, y: 0.35, z: -0.4 },
        { x: 0.4, y: 0.35, z: -0.4 },
      ];

      let cached = kartPhysicsCache.get(kartEntityId2);
      if (!cached) {
        let transform = untrack(() => entityGetComponentData(ecs, kartEntityId2, componentRegistry.Transform3D));
        const initX = transform?.ox ?? 0;
        const initY = transform?.oy ?? 0;
        const initZ = transform?.oz ?? 0;
        const initQx = transform?.qx ?? 0;
        const initQy = transform?.qy ?? 0;
        const initQz = transform?.qz ?? 0;
        const initQw = transform?.qw ?? 1;

        const chassisDesc = RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(initX, initY, initZ)
          .setRotation({ x: initQx, y: initQy, z: initQz, w: initQw })
          .setCanSleep(false)
          .setCcdEnabled(true)
          .setLinearDamping(0.1)
          .setAngularDamping(5.0)
          .setAdditionalMass(5.0);
        chassisDesc.centerOfMass = { x: 0, y: 0.08, z: 0.25 };
        const chassisBody = currentWorld.createRigidBody(chassisDesc);
        const chassisHandle = chassisBody.handle;
        const chassisCollider = RAPIER.ColliderDesc.cuboid(0.3, 0.2, 0.6)
          .setTranslation(0, 0.35, 0)
          .setRestitution(0.0)
          .setFriction(0.8);
        currentWorld.createCollider(chassisCollider, chassisBody);

        const vehicle = currentWorld.createVehicleController(chassisBody);

        vehicle.indexUpAxis = 1;
        vehicle.setIndexForwardAxis = 2;

        const suspensionRestLength = 0.1;

        wheelPositions.forEach((pos, i) => {
          vehicle.addWheel(
            RAPIER.VectorOps.new(pos.x, pos.y, pos.z),
            RAPIER.VectorOps.new(0, -1, 0),
            RAPIER.VectorOps.new(-1, 0, 0),
            suspensionRestLength,
            wheelRadius
          );
          vehicle.setWheelFrictionSlip(i, 3.5);
          let isFront = i <= 1;
          vehicle.setWheelSuspensionStiffness(i, isFront ? 22 : 18);
          vehicle.setWheelSuspensionCompression(i, isFront ? 28 : 28);
          vehicle.setWheelSuspensionRelaxation(i, isFront ? 30 : 28);
          vehicle.setWheelMaxSuspensionForce(i, 2000);
          vehicle.setWheelMaxSuspensionTravel(i, 0.6);
        });

        cached = {
          vehicle,
          chassisHandle,
          wheelPositions,
          wheelRadius,
          suspensionRestLength,
          wheelAxleDirs: wheelPositions.map(() => ({ x: -1, y: 0, z: 0 })),
          currentSteering: 0,
        };
        kartPhysicsCache.set(kartEntityId2, cached);
      }

      const wheelMeshes: THREE.Mesh[] = [];
      for (let i = 0; i < 4; i++) {
        let geometry = new THREE.CylinderGeometry(0.22, 0.22, 0.08, 8);
        geometry.rotateZ(0.5 * Math.PI);
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8, metalness: 0.2 }),
        );
        wheelMeshes.push(mesh);
        wheelMeshGroup.add(mesh);
      }
      onCleanup(() => {
        for (const mesh of wheelMeshes) {
          wheelMeshGroup.remove(mesh);
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });

      return {
        kartEntityId: kartEntityId2,
        vehicle: cached.vehicle,
        chassisHandle: cached.chassisHandle,
        wheelAxleDirs: cached.wheelAxleDirs,
        wheelMeshes,
        wheelRadius: cached.wheelRadius,
        suspensionRestLength: cached.suspensionRestLength,
        wheelPositions: cached.wheelPositions,
      };
    },
  ));
  let rapierDebugRenderer: RapierDebugRenderer | undefined = undefined;
  if (SHOW_DEBUG_MESH) {
    createEffect(
      scene,
      (scene) => {
        if (scene === undefined) {
          return;
        }
        rapierDebugRenderer = new RapierDebugRenderer(scene, currentWorld);
        scene.add(wheelMeshGroup);
        onCleanup(() => {
          scene.remove(wheelMeshGroup);
        });
      },
    )
  }
  let triggerRender: (() => void) | undefined;
  let UI: Component = () => {
    return (
      <ShowAll whenAll={[ track, trackPtNodes, curve, ]}>
        {([ track, trackPtNodes, curve, ]) => (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <Canvas
              frameloop="never"
              gl={(canvas) => new WebGPURenderer({ canvas })}
              ref={(ref) => {
                runWithOwner(null, () => {
                  triggerRender = () => ref.render(performance.now());
                  ref.camera.position.set(5, 5, 5);
                  ref.camera.lookAt(new THREE.Vector3(0.0, 0.0, 0.0));
                  setScene(ref.scene);
                  setCamera(ref.camera);
                });
              }}
              style={{
                "width": "100%",
                "height": "100%",
              }}
            >
              <T.AmbientLight args={[0xffffff, 0.6]} />
              <T.DirectionalLight args={[0xffffff, 1.0]} position={[5, 10, 7]} />
              <RenderTrack
                ref={() => {}}
                track={track().track}
                trackPtNodes={trackPtNodes()}
                curve={curve()}
                isSelected={false}
              />
              <For each={kartsWithPhysics()}>
                {(kartPhysics) => {
                  let kartPhysics2 = untrack(kartPhysics);
                  let kartEntityId = kartPhysics2.kartEntityId;
                  let kartEntity = ecs.entity(kartEntityId);
                  let playerConfig = {
                    playerType: kartEntity.getField(RegisteredPlayerConfig, "playerType"),
                    facingForward: kartEntity.getField(RegisteredPlayerConfig, "facingForward")
                  };

                  let kartModel = createMemo(async () => await loadKartModel());

                  let Player = () => (
                    <Switch>
                      <Match when={playerConfig.playerType == 0}>
                        <T.Group
                          position={[ 0.0, 0.32, 0.0, ]}
                          scale={[ 0.5, 0.5, 0.5, ]}
                        >
                          <Melty/>
                        </T.Group>
                      </Match>
                      <Match when={playerConfig.playerType == 1}>
                        <T.Group
                          position={[ 0.0, 0.32, 0.0, ]}
                          scale={[ 0.5, 0.5, 0.5, ]}
                        >
                          <Entity from={createCubey()}/>
                        </T.Group>
                      </Match>
                      <Match when={playerConfig.playerType == 2}>
                        <T.Group
                          position={[ 0.0, 0.32, 0.0, ]}
                          scale={[ 0.5, 0.5, 0.5, ]}
                        >
                          <Entity from={createSolidLogo()}/>
                        </T.Group>
                      </Match>
                    </Switch>
                  );
                  return (
                    <T.Group
                      position={[
                        kartEntity.getField(componentRegistry.Transform3D, "ox"),
                        kartEntity.getField(componentRegistry.Transform3D, "oy"),
                        kartEntity.getField(componentRegistry.Transform3D, "oz"),
                      ]}
                      quaternion={[
                        kartEntity.getField(componentRegistry.Transform3D, "qx"),
                        kartEntity.getField(componentRegistry.Transform3D, "qy"),
                        kartEntity.getField(componentRegistry.Transform3D, "qz"),
                        kartEntity.getField(componentRegistry.Transform3D, "qw"),
                      ]}
                    >
                      <>{(() => {
                        let kartModel2 = kartModel();
                        return untrack(() => (<Entity from={kartModel2}/>));
                      })()}</>
                      <Player/>
                    </T.Group>
                  );
                }}
              </For>
              <For each={ufoEntityIds()}>
                {(ufoEntityId) => {
                  let ufo = createMemo(() => entityGetComponentData(ecs, untrack(ufoEntityId), componentRegistry.Ufo));
                  let ufoStage = createMemo(() => ufo()?.stage as UfoStage || undefined);
                  let ufoTransform = createMemo(() => entityGetComponentData(ecs, untrack(ufoEntityId), componentRegistry.Transform3D));
                  return (
                    <Ufo
                      visible
                      position={(() => {
                        let transform = ufoTransform();
                        if (transform === undefined) {
                          return undefined;
                        }
                        return [ transform.ox, transform.oy, transform.oz, ];
                      })()}
                      showTractorBeam={ufoStage() === UfoStage.BEAMING_UP_KART || ufoStage() === UfoStage.BEAMING_DOWN_KART}
                      time={ufo()?.timeout ?? 0.0}
                    />
                  );
                }}
              </For>
            </Canvas>
            <joystick.UI/>
            <actionButton.UI/>
          </div>
        )}
      </ShowAll>
    );
  };
  let tmpV1 = new THREE.Vector3();
  let tmpV2 = new THREE.Vector3();
  let tmpQ1 = new THREE.Quaternion();
  let maxSteerDeg = 15 * Math.PI / 180;
  let steeringLerpSpeed = 8.0;
  let joystick = Joystick({
    position: createMemo(() =>
      new THREE.Vector2(
        50.0,
        (window.innerHeight ?? 800) - 50 - 150,
      )
    ),
    hitAreaSize: 150,
    outerRingSize: () => 0.8 * 150,
    knobSize: () => 70,
  });
  let actionButton = ActionButton({
    position: createMemo(() =>
      new THREE.Vector2(
        (window.innerWidth ?? 800) - 50 - 100,
        (window.innerHeight ?? 800) - 50 - 100,
      )
    ),
    size: () => 100,
  });
  let actionButton2 = ActionButton({
    position: createMemo(() =>
      new THREE.Vector2(
        (window.innerWidth ?? 800) - (50.0 + 0.5 * (80.0 - 100.0)) - 100,
        (window.innerHeight ?? 800) - 150.0 - 100,
      )
    ),
    size: () => 80.0,
    colour: () => "red",
    specialSlidePress: () => true,
  });
  createEffect(
    joystick.value,
    (joyVal) => {
      let leftDown = joyVal.x < -0.2;
      let rightDown = joyVal.x > 0.2;
      let upDown = joyVal.y < -0.2;
      let downDown = joyVal.y > 0.2;
      updateKeyboardInput({ leftDown, rightDown, upDown, downDown, });
    },
  );
  createEffect(
    actionButton.pressed,
    (actionDown) => {
      updateKeyboardInput({ actionDown });
    },
  );
  createEffect(
    actionButton2.pressed,
    (actionDown) => {
      updateKeyboardInput({ actionDown });
    },
  );

  let update = (dt: number) => {
    for (let kartPhysics2 of kartsWithPhysics()) {
      let entityId = kartPhysics2.kartEntityId;
      let chassisBody = kartPhysics2.vehicle.chassis();
      let transform = entityGetComponentData(ecs, entityId, componentRegistry.Transform3D);
      if (transform !== undefined) {
        chassisBody.setTranslation(
          { x: transform.ox, y: transform.oy, z: transform.oz },
          true,
        );
        chassisBody.setRotation(
          { x: transform.qx, y: transform.qy, z: transform.qz, w: transform.qw },
          true,
        );
      }
      let velocity = entityGetComponentData(ecs, entityId, componentRegistry.Velocity);
      if (velocity !== undefined) {
        chassisBody.setLinvel(velocity, true);
      }
      let angularVelocity = entityGetComponentData(ecs, entityId, componentRegistry.AngularVelocity);
      if (angularVelocity !== undefined) {
        chassisBody.setAngvel(angularVelocity, true);
      }
    }
    for (let kartPhysics2 of kartsWithPhysics()) {
      let entityId = kartPhysics2.kartEntityId;
      let isLocalPlayer = entityId === playerId();

      let kartUpDown = false, kartDownDown = false, kartLeftDown = false, kartRightDown = false, kartActionDown = false;
      if (!isMultiplayer) {
        let keyboard = ecs.ecs.resources.get(RegisteredKeyboardInput);
        kartUpDown = keyboard.upDown !== 0;
        kartDownDown = keyboard.downDown !== 0;
        kartLeftDown = keyboard.leftDown !== 0;
        kartRightDown = keyboard.rightDown !== 0;
        kartActionDown = keyboard.actionDown !== 0;
      } else {
        let mask = multiplayerSession.v2RemoteInputs.get(entityId) ?? 0;
        kartUpDown = (mask & 0b00001) !== 0;
        kartDownDown = (mask & 0b00010) !== 0;
        kartLeftDown = (mask & 0b00100) !== 0;
        kartRightDown = (mask & 0b01000) !== 0;
        kartActionDown = (mask & 0b10000) !== 0;
      }

      const vehicle = kartPhysics2.vehicle;
      const chassisBody = vehicle.chassis();
      let rot = chassisBody.rotation();
      tmpQ1.set(rot.x, rot.y, rot.z, rot.w);
      let kartForward = new THREE.Vector3(0, 0, 1).applyQuaternion(rot);
      let kartVel = new THREE.Vector3().copy(chassisBody.linvel());
      let kartForwardSpeed = kartForward.dot(kartVel);

      let engineForce = 0.0;
      let steering = 0.0;

      let actionPressed = kartActionDown;

      if (kartUpDown || actionPressed) {
        engineForce = 1.0;
      } else if (kartDownDown) {
        engineForce = -0.25;
      }

      const KART_MAX_SPEED = 50.0;
      let maxSpeedFactor = 1.0 - Math.max(0.0, Math.min(1.0, kartForwardSpeed / KART_MAX_SPEED));
      engineForce *= maxSpeedFactor;

      let targetSteering = 0;
      if (kartLeftDown) {
        targetSteering = maxSteerDeg;
      }
      if (kartRightDown) {
        targetSteering = -maxSteerDeg;
      }
      let cached = kartPhysicsCache.get(entityId)!;
      let cs = cached.currentSteering + (targetSteering - cached.currentSteering) * Math.min(1, steeringLerpSpeed * dt);
      cached.currentSteering = cs;
      steering = cs;

      let coyoteTime = ecs.ecs.getField(kartPhysics2.kartEntityId, componentRegistry.CoyoteTime, "timeout");
      if (
        vehicle.wheelIsInContact(2) ||
        vehicle.wheelIsInContact(3)
      ) {
        coyoteTime = COYOTE_TIMEOUT;
      } else {
        coyoteTime -= dt;
      }
      let rearOnGround = vehicle.wheelIsInContact(2) || vehicle.wheelIsInContact(3);
      if (coyoteTime > 0.0) {
        vehicle.chassis().applyImpulse(
          {
            x: kartForward.x * engineForce,
            y: kartForward.y * engineForce,
            z: kartForward.z * engineForce,
          },
          true,
        );
        // Apply steering torque when airborne during coyote time
        if (!rearOnGround) {
          let steerTorque = steering * 0.8;
          let localTorque = new THREE.Vector3(0, steerTorque, 0).applyQuaternion(tmpQ1);
          chassisBody.applyTorqueImpulse(localTorque, true);
        }
      } else {
        coyoteTime = 0.0;
      }
      ecs.setField(kartPhysics2.kartEntityId, componentRegistry.CoyoteTime, "timeout", coyoteTime);
      // Apply steering to front wheels (0 and 1)
      for (let i = 0; i <= 1; i++) {
        vehicle.setWheelSteering(i, steering);
      }
    }
    let tmp = dt;
    while (tmp > 0.0) {
      const fixedDt = 1 / (60 * 5);
      tmp -= fixedDt;
      const w = currentWorld;
      if (!w || !w.integrationParameters) break;
      w.timestep = fixedDt;
      for (let kartPhysics2 of kartsWithPhysics()) {
        kartPhysics2.vehicle.updateVehicle(fixedDt);
      }
      w.step();
    }
    rapierDebugRenderer?.update();
    for (let kartPhysics2 of kartsWithPhysics()) {
      let entityId = kartPhysics2.kartEntityId;
      let chassisBody = kartPhysics2.vehicle.chassis();
      let pos = chassisBody.translation();
      let rot = chassisBody.rotation();
      let vel = chassisBody.linvel();
      let angVel = chassisBody.angvel();
      ecs.setField(
        entityId,
        componentRegistry.Transform3D,
        "ox",
        pos.x,
      );
      ecs.setField(
        entityId,
        componentRegistry.Transform3D,
        "oy",
        pos.y,
      );
      ecs.setField(
        entityId,
        componentRegistry.Transform3D,
        "oz",
        pos.z,
      );
      ecs.setField(
        entityId,
        componentRegistry.Transform3D,
        "qx",
        rot.x,
      );
      ecs.setField(
        entityId,
        componentRegistry.Transform3D,
        "qy",
        rot.y,
      );
      ecs.setField(
        entityId,
        componentRegistry.Transform3D,
        "qz",
        rot.z,
      );
      ecs.setField(
        entityId,
        componentRegistry.Transform3D,
        "qw",
        rot.w,
      );
      ecs.setField(
        entityId,
        componentRegistry.Velocity,
        "x",
        vel.x,
      );
      ecs.setField(
        entityId,
        componentRegistry.Velocity,
        "y",
        vel.y,
      );
      ecs.setField(
        entityId,
        componentRegistry.Velocity,
        "z",
        vel.z,
      );
      ecs.setField(
        entityId,
        componentRegistry.AngularVelocity,
        "x",
        angVel.x,
      );
      ecs.setField(
        entityId,
        componentRegistry.AngularVelocity,
        "y",
        angVel.y,
      );
      ecs.setField(
        entityId,
        componentRegistry.AngularVelocity,
        "z",
        angVel.z,
      );
      // If the transform is close to the last transform, then increase the
      // still time, otherwise clear the still time and set the last transform
      // to the current transform.
      let isUfoTarget = ecs.entity(entityId).hasComponent(componentRegistry.UfoTarget);
      if (!isUfoTarget) {
        let lastOx = ecs.ecs.getField(entityId, componentRegistry.LastTransform3D, "ox");
        let lastOy = ecs.ecs.getField(entityId, componentRegistry.LastTransform3D, "oy");
        let lastOz = ecs.ecs.getField(entityId, componentRegistry.LastTransform3D, "oz");
        let lastQx = ecs.ecs.getField(entityId, componentRegistry.LastTransform3D, "qx");
        let lastQy = ecs.ecs.getField(entityId, componentRegistry.LastTransform3D, "qy");
        let lastQz = ecs.ecs.getField(entityId, componentRegistry.LastTransform3D, "qz");
        let lastQw = ecs.ecs.getField(entityId, componentRegistry.LastTransform3D, "qw");
        let movementTest =
          Math.abs(pos.x - lastOx)
          + Math.abs(pos.y - lastOy)
          + Math.abs(pos.z - lastOz)
          + Math.abs(rot.x - lastQx)
          + Math.abs(rot.y - lastQy)
          + Math.abs(rot.z - lastQz)
          + Math.abs(rot.w - lastQw);
        let sendUfo = false;
        if (pos.y < trackMinY - 100.0) {
          sendUfo = true;
        }
        if (movementTest > 0.01) {
          ecs.setField(entityId, componentRegistry.StillTime, "time", 0.0);
          ecs.setField(entityId, componentRegistry.LastTransform3D, "ox", pos.x);
          ecs.setField(entityId, componentRegistry.LastTransform3D, "oy", pos.y);
          ecs.setField(entityId, componentRegistry.LastTransform3D, "oz", pos.z);
          ecs.setField(entityId, componentRegistry.LastTransform3D, "qx", rot.x);
          ecs.setField(entityId, componentRegistry.LastTransform3D, "qy", rot.y);
          ecs.setField(entityId, componentRegistry.LastTransform3D, "qz", rot.z);
          ecs.setField(entityId, componentRegistry.LastTransform3D, "qw", rot.w);
        } else {
          let stillTime = ecs.ecs.getField(entityId, componentRegistry.StillTime, "time");
          if (stillTime >= 5.0) {
            sendUfo = true;
          } else {
            stillTime += dt;
            ecs.setField(entityId, componentRegistry.StillTime, "time", stillTime);
          }
        }
        if (sendUfo) {
          console.log("Send the UFO!");
          let ufoEntityId = getFreeEntityOrCreate(ecs);
          ecs.setField(entityId, componentRegistry.StillTime, "time", 0.0);
          ecs.addComponent(entityId, componentRegistry.UfoTarget, {
            ufo: ufoEntityId,
          });
          ecs.addComponent(
            ufoEntityId,
            componentRegistry.Ufo,
            {
              stage: UfoStage.CHASING_KART,
              target: entityId,
              timeout: 0,
            },
          );
          ecs.addComponent(
            ufoEntityId,
            componentRegistry.Transform3D,
            {
              ox: 0.0,
              oy: 0.0,
              oz: 0.0,
              qx: 0.0,
              qy: 0.0,
              qz: 0.0,
              qw: 1.0,
            },
          );
        }
      } else {
        if (pos.y < trackMinY - 100.0) {
          ecs.setField(entityId, componentRegistry.Velocity, "x", 0.0);
          ecs.setField(entityId, componentRegistry.Velocity, "y", 0.0);
          ecs.setField(entityId, componentRegistry.Velocity, "z", 0.0);
        }
      }
    }
    // Update visual wheel meshes from vehicle controller
    for (let kartPhysics2 of kartsWithPhysics()) {
      const vehicle = kartPhysics2.vehicle;
      const wheelMeshes = kartPhysics2.wheelMeshes;
      const chassisBody = vehicle.chassis();
      const cPos = chassisBody.translation();
      const cRot = chassisBody.rotation();
      tmpQ1.set(cRot.x, cRot.y, cRot.z, cRot.w);
      tmpV1.set(0, -1, 0).applyQuaternion(tmpQ1);
      for (let i = 0; i < vehicle.numWheels(); i++) {
        const hardPt = vehicle.wheelHardPoint(i);
        const suspLen = vehicle.wheelSuspensionLength(i);
        if (hardPt == null || suspLen == null) continue;
        const offset = suspLen;
        wheelMeshes[i].position.set(
          hardPt.x + tmpV1.x * offset,
          hardPt.y + tmpV1.y * offset,
          hardPt.z + tmpV1.z * offset,
        );
        wheelMeshes[i].quaternion.set(
          cRot.x, cRot.y, cRot.z, cRot.w,
        )
      }
    }
    // Ufo
    {
      let flyOffUfos: EntityID[] = [];
      let releasedTargets: EntityID[] = [];
      let query = ecs.ecs.query(componentRegistry.Ufo, componentRegistry.Transform3D);
      for (let i = 0; i < query.archetypeCount; ++i) {
        let arch = query.archetypes[i];
        for (let j = 0; j < arch.entityCount; ++j) {
          let ufoEntityId = arch.entityIds[j] as EntityID;
          let ufoStage = ecs.ecs.getField(ufoEntityId, componentRegistry.Ufo, "stage") as UfoStage;
          let targetEntityId = ecs.ecs.getField(ufoEntityId, componentRegistry.Ufo, "target") as EntityID;
          let ufoPosX = ecs.ecs.getField(ufoEntityId, componentRegistry.Transform3D, "ox");
          let ufoPosY = ecs.ecs.getField(ufoEntityId, componentRegistry.Transform3D, "oy");
          let ufoPosZ = ecs.ecs.getField(ufoEntityId, componentRegistry.Transform3D, "oz");
          let targetPosX = ecs.ecs.getField(targetEntityId, componentRegistry.Transform3D, "ox");
          let targetPosY = ecs.ecs.getField(targetEntityId, componentRegistry.Transform3D, "oy");
          let targetPosZ = ecs.ecs.getField(targetEntityId, componentRegistry.Transform3D, "oz");
          switch (ufoStage) {
            case UfoStage.CHASING_KART: {
              let dx = (targetPosX - ufoPosX);
              let dy = (targetPosY + 4.0 - ufoPosY);
              let dz = (targetPosZ - ufoPosZ);
              ufoPosX += dx * 0.02;
              ufoPosY += dy * 0.02;
              ufoPosZ += dz * 0.02;
              ecs.setField(ufoEntityId, componentRegistry.Transform3D, "ox", ufoPosX);
              ecs.setField(ufoEntityId, componentRegistry.Transform3D, "oy", ufoPosY);
              ecs.setField(ufoEntityId, componentRegistry.Transform3D, "oz", ufoPosZ);
              let d = dx * dx + dy * dy + dz * dz;
              if (d <= 0.1 * 0.1) {
                ecs.setField(ufoEntityId, componentRegistry.Ufo, "stage", UfoStage.BEAMING_UP_KART);
                ecs.setField(ufoEntityId, componentRegistry.Ufo, "timeout", UFO_BEAMING_TIMEOUT);
              }
              break;
            }
            case UfoStage.BEAMING_UP_KART: {
              let timeout = ecs.ecs.getField(ufoEntityId, componentRegistry.Ufo, "timeout");
              timeout -= dt;
              let a = Math.max(0, 1 - timeout / UFO_BEAMING_TIMEOUT);
              targetPosX += a * (ufoPosX - targetPosX);
              targetPosY += a * (ufoPosY - targetPosY);
              targetPosZ += a * (ufoPosZ - targetPosZ);
              ecs.setField(targetEntityId, componentRegistry.Transform3D, "ox", targetPosX);
              ecs.setField(targetEntityId, componentRegistry.Transform3D, "oy", targetPosY);
              ecs.setField(targetEntityId, componentRegistry.Transform3D, "oz", targetPosZ);
              ecs.setField(targetEntityId, componentRegistry.Velocity, "x", 0.0);
              ecs.setField(targetEntityId, componentRegistry.Velocity, "y", 0.0);
              ecs.setField(targetEntityId, componentRegistry.Velocity, "z", 0.0);
              ecs.setField(targetEntityId, componentRegistry.AngularVelocity, "x", 0.0);
              ecs.setField(targetEntityId, componentRegistry.AngularVelocity, "y", 0.0);
              ecs.setField(targetEntityId, componentRegistry.AngularVelocity, "z", 0.0);
              if (timeout > 0.0) {
                ecs.setField(ufoEntityId, componentRegistry.Ufo, "timeout", timeout);
              } else {
                ecs.setField(ufoEntityId, componentRegistry.Ufo, "timeout", 0.0);
                ecs.setField(ufoEntityId, componentRegistry.Ufo, "stage", UfoStage.MOVING_KART);
              }
              break;
            }
            case UfoStage.MOVING_KART: {
              let trackEval = curve()?.trackEval;
              if (trackEval !== undefined) {
                let startPos = trackEval.getFrameAt(0).position;
                let dx = (startPos.x - ufoPosX);
                let dy = (startPos.y + 4.0 - ufoPosY);
                let dz = (startPos.z - ufoPosZ);
                ufoPosX += dx * 0.02;
                ufoPosY += dy * 0.02;
                ufoPosZ += dz * 0.02;
                targetPosX = ufoPosX;
                targetPosY = ufoPosY;
                targetPosZ = ufoPosZ;
                ecs.setField(targetEntityId, componentRegistry.Transform3D, "ox", targetPosX);
                ecs.setField(targetEntityId, componentRegistry.Transform3D, "oy", targetPosY);
                ecs.setField(targetEntityId, componentRegistry.Transform3D, "oz", targetPosZ);
                ecs.setField(ufoEntityId, componentRegistry.Transform3D, "ox", ufoPosX);
                ecs.setField(ufoEntityId, componentRegistry.Transform3D, "oy", ufoPosY);
                ecs.setField(ufoEntityId, componentRegistry.Transform3D, "oz", ufoPosZ);
                let d = dx * dx + dy * dy + dz * dz;
                if (d <= 0.1 * 0.1) {
                  ecs.setField(ufoEntityId, componentRegistry.Ufo, "stage", UfoStage.BEAMING_DOWN_KART);
                  ecs.setField(ufoEntityId, componentRegistry.Ufo, "timeout", UFO_BEAMING_TIMEOUT);
                }
              }
              break;
            }
            case UfoStage.BEAMING_DOWN_KART: {
              let trackEval = curve()?.trackEval;
              if (trackEval !== undefined) {
                let frame = trackEval.getFrameAt(0);
                let right = frame.right.clone();
                let up = frame.up;
                let matrix = new THREE.Matrix4().makeBasis(
                  right,
                  up,
                  new THREE.Vector3().crossVectors(right, up),
                );
                let rot = new THREE.Quaternion().setFromRotationMatrix(matrix);
                let timeout = ecs.ecs.getField(ufoEntityId, componentRegistry.Ufo, "timeout");
                timeout -= dt;
                let a = Math.max(0, 1 - timeout / UFO_BEAMING_TIMEOUT);
                targetPosX += a * (ufoPosX - targetPosX);
                targetPosY += a * (ufoPosY - 2.0 - targetPosY);
                targetPosZ += a * (ufoPosZ - targetPosZ);
                let ufoRotX = ecs.ecs.getField(ufoEntityId, componentRegistry.Transform3D, "qx");
                let ufoRotY = ecs.ecs.getField(ufoEntityId, componentRegistry.Transform3D, "qy");
                let ufoRotZ = ecs.ecs.getField(ufoEntityId, componentRegistry.Transform3D, "qz");
                let ufoRotW = ecs.ecs.getField(ufoEntityId, componentRegistry.Transform3D, "qw");
                let q = new THREE.Quaternion(ufoRotX, ufoRotY, ufoRotZ, ufoRotW);
                q.slerp(rot, Math.min(1.0, 3.0 * dt));
                ufoRotX = q.x;
                ufoRotY = q.y;
                ufoRotZ = q.z;
                ufoRotW = q.w;
                ecs.setField(ufoEntityId, componentRegistry.Transform3D, "qx", ufoRotX);
                ecs.setField(ufoEntityId, componentRegistry.Transform3D, "qy", ufoRotY);
                ecs.setField(ufoEntityId, componentRegistry.Transform3D, "qz", ufoRotZ);
                ecs.setField(ufoEntityId, componentRegistry.Transform3D, "qw", ufoRotW);
                ecs.setField(targetEntityId, componentRegistry.Transform3D, "ox", targetPosX);
                ecs.setField(targetEntityId, componentRegistry.Transform3D, "oy", targetPosY);
                ecs.setField(targetEntityId, componentRegistry.Transform3D, "oz", targetPosZ);
                ecs.setField(targetEntityId, componentRegistry.Transform3D, "qx", rot.x);
                ecs.setField(targetEntityId, componentRegistry.Transform3D, "qy", rot.y);
                ecs.setField(targetEntityId, componentRegistry.Transform3D, "qz", rot.z);
                ecs.setField(targetEntityId, componentRegistry.Transform3D, "qw", rot.w);
                ecs.setField(targetEntityId, componentRegistry.Velocity, "x", 0.0);
                ecs.setField(targetEntityId, componentRegistry.Velocity, "y", 0.0);
                ecs.setField(targetEntityId, componentRegistry.Velocity, "z", 0.0);
                ecs.setField(targetEntityId, componentRegistry.AngularVelocity, "x", 0.0);
                ecs.setField(targetEntityId, componentRegistry.AngularVelocity, "y", 0.0);
                ecs.setField(targetEntityId, componentRegistry.AngularVelocity, "z", 0.0);
                if (timeout > 0.0) {
                  ecs.setField(ufoEntityId, componentRegistry.Ufo, "timeout", timeout);
                } else {
                  ecs.setField(ufoEntityId, componentRegistry.Ufo, "stage", UfoStage.FLY_OFF);
                  ecs.setField(ufoEntityId, componentRegistry.Ufo, "timeout", UFO_FLY_OFF_TIMEOUT);
                  releasedTargets.push(targetEntityId);
                }
              }
              break;
            }
            case UfoStage.FLY_OFF: {
              let timeout = ecs.ecs.getField(ufoEntityId, componentRegistry.Ufo, "timeout");
              timeout -= dt;
              ufoPosY += 20.0 * dt;
              ecs.setField(ufoEntityId, componentRegistry.Transform3D, "oy", ufoPosY);
              if (timeout > 0.0) {
                ecs.setField(ufoEntityId, componentRegistry.Ufo, "timeout", timeout);
              } else {
                flyOffUfos.push(ufoEntityId);
              }
              break;
            }
          }
        }
      }
      for (let id of releasedTargets) {
        ecs.removeComponent(id, componentRegistry.UfoTarget);
      }
      for (let id of flyOffUfos) {
        ecs.removeComponent(id, componentRegistry.Ufo);
        ecs.removeComponent(id, componentRegistry.Transform3D);
        ecs.addComponent(id, RegisteredFreeEntity);
      }
    }
    // camera chase player
    let camera2 = camera();
    let playerId2 = playerId();
    if (camera2 !== undefined && playerId2 !== undefined) {
      let playerPosX = ecs.ecs.getField(
        playerId2,
        componentRegistry.Transform3D,
        "ox",
      );
      let playerPosY = ecs.ecs.getField(
        playerId2,
        componentRegistry.Transform3D,
        "oy",
      );
      let playerPosZ = ecs.ecs.getField(
        playerId2,
        componentRegistry.Transform3D,
        "oz",
      );
      let playerOrientX = ecs.ecs.getField(
        playerId2,
        componentRegistry.Transform3D,
        "qx",
      );
      let playerOrientY = ecs.ecs.getField(
        playerId2,
        componentRegistry.Transform3D,
        "qy",
      );
      let playerOrientZ = ecs.ecs.getField(
        playerId2,
        componentRegistry.Transform3D,
        "qz",
      );
      let playerOrientW = ecs.ecs.getField(
        playerId2,
        componentRegistry.Transform3D,
        "qw",
      );
      if (ecs.ecs.hasComponent(playerId2, componentRegistry.UfoTarget)) {
        let ufoId = ecs.ecs.getField(playerId2, componentRegistry.UfoTarget, "ufo") as EntityID;
        let ufoPosX = ecs.ecs.getField(ufoId, componentRegistry.Transform3D, "ox");
        let ufoPosY = ecs.ecs.getField(ufoId, componentRegistry.Transform3D, "oy");
        let ufoPosZ = ecs.ecs.getField(ufoId, componentRegistry.Transform3D, "oz");
        let ufoOrientX = ecs.ecs.getField(ufoId, componentRegistry.Transform3D, "qx");
        let ufoOrientY = ecs.ecs.getField(ufoId, componentRegistry.Transform3D, "qy");
        let ufoOrientZ = ecs.ecs.getField(ufoId, componentRegistry.Transform3D, "qz");
        let ufoOrientW = ecs.ecs.getField(ufoId, componentRegistry.Transform3D, "qw");
        tmpV1.set(ufoPosX, ufoPosY, ufoPosZ);
        tmpQ1.set(ufoOrientX, ufoOrientY, ufoOrientZ, ufoOrientW);
        tmpV2.set(0, 0, -10).applyQuaternion(tmpQ1).add(tmpV1);
      } else {
        tmpV1.set(playerPosX, playerPosY, playerPosZ);
        tmpQ1.set(playerOrientX, playerOrientY, playerOrientZ, playerOrientW);
        tmpV2.set(0, 2, -5).applyQuaternion(tmpQ1).add(tmpV1);
    }
    camera2.position.lerp(tmpV2, 0.05);
    let tmpQ2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), Math.PI).premultiply(tmpQ1);
    camera2.quaternion.slerp(tmpQ2, 0.05);
    }
    triggerRender?.();
  };

  if (isMultiplayer) {
    const kartCompKey = RegisteredKartConfig.id.toString();
    const ufoCompKey = componentRegistry.Ufo.id.toString();
    const ignoredResources = new Set([
      RegisteredMasterState.description!,
      RegisteredKeyboardInput.description!,
      RegisteredJoystickInput.description!,
      RegisteredSoundEnabled.description!,
      RegisteredOrbitEnabled.description!,
    ]);

    const compDefMap = new Map<string, ComponentDef>();
    for (const [k, v] of Object.entries(componentRegistry)) {
      if (v && typeof (v as ComponentDef).id === 'number') {
        compDefMap.set((v as ComponentDef).id.toString(), v as ComponentDef);
      }
    }
    for (const def of [
      RegisteredKartConfig, RegisteredPlayerConfig, RegisteredNetworkSlot,
      RegisteredAIControlled, RegisteredInputControlled, RegisteredOrientation,
      RegisteredRaceStats, RegisteredLocalPlayerPosition, RegisteredFreeEntity,
    ]) {
      compDefMap.set(def.id.toString(), def);
    }

    const v2Game: Game = {
      serialize: () => {
        const snapshot = ecs.serialize(ignoredResources);
        snapshot.entities = snapshot.entities.filter(e =>
          e.components.some(c => c.componentKey === kartCompKey) ||
          e.components.some(c => c.componentKey === ufoCompKey)
        );
        const ecsJson = JSON.stringify(snapshot);
        return new TextEncoder().encode(ecsJson);
      },

      deserialize: (data) => {
        const snapshot = JSON.parse(new TextDecoder().decode(data)) as ReactiveECSSnapshot;

        const targetIds = new Set(snapshot.entities.map(e => e.id as EntityID));

        const currentKartIds: EntityID[] = [];
        for (const arch of ecs.query(RegisteredKartConfig)) {
          for (let i = 0; i < arch.entityCount; i++) {
            currentKartIds.push(arch.entityIds[i] as EntityID);
          }
        }
        const currentUfoIds: EntityID[] = [];
        for (const arch of ecs.query(componentRegistry.Ufo)) {
          for (let i = 0; i < arch.entityCount; i++) {
            currentUfoIds.push(arch.entityIds[i] as EntityID);
          }
        }

        for (const id of currentKartIds) {
          if (!targetIds.has(id) && ecs.ecs.isAlive(id)) {
            ecs.despawn(id);
          }
        }
        for (const id of currentUfoIds) {
          if (!targetIds.has(id) && ecs.ecs.isAlive(id)) {
            ecs.despawn(id);
          }
        }

        for (const entityDef of snapshot.entities) {
          const eid = entityDef.id as EntityID;

          if (!ecs.ecs.isAlive(eid)) {
            while (!ecs.ecs.isAlive(eid)) {
              ecs.spawn();
            }
          }

          const targetCompKeys = new Set(entityDef.components.map(c => c.componentKey));

          for (const [compKey, def] of compDefMap) {
            if (ecs.ecs.hasComponent(eid, def) && !targetCompKeys.has(compKey)) {
              ecs.ecs.removeComponent(eid, def);
            }
          }

          for (const comp of entityDef.components) {
            const def = compDefMap.get(comp.componentKey);
            if (!def) continue;

            if (!ecs.ecs.hasComponent(eid, def)) {
              if (Object.keys(comp.values).length === 0) {
                ecs.ecs.addComponent(eid, def as ComponentDef<Record<string, never>>);
              } else {
                ecs.ecs.addComponent(eid, def as ComponentDef<any>, comp.values);
              }
            } else {
              for (const [field, value] of Object.entries(comp.values)) {
                (ecs.ecs as any).setField(eid, def, field, value);
              }
            }
          }

          // Sync ECS state back into existing rapier bodies for kart entities
          if (entityDef.components.some(c => c.componentKey === kartCompKey)) {
            const cached = kartPhysicsCache.get(eid);
            if (cached) {
              const body = currentWorld.getRigidBody(cached.chassisHandle);
              if (body) {
                const tx = entityDef.components.find(c => c.componentKey === componentRegistry.Transform3D.id.toString());
                if (tx) {
                  body.setTranslation({ x: tx.values.ox ?? 0, y: tx.values.oy ?? 0, z: tx.values.oz ?? 0 }, true);
                  body.setRotation({ x: tx.values.qx ?? 0, y: tx.values.qy ?? 0, z: tx.values.qz ?? 0, w: tx.values.qw ?? 1 }, true);
                }
                const vel = entityDef.components.find(c => c.componentKey === componentRegistry.Velocity.id.toString());
                if (vel) {
                  body.setLinvel({ x: vel.values.x ?? 0, y: vel.values.y ?? 0, z: vel.values.z ?? 0 }, true);
                }
                const angVel = entityDef.components.find(c => c.componentKey === componentRegistry.AngularVelocity.id.toString());
                if (angVel) {
                  body.setAngvel({ x: angVel.values.x ?? 0, y: angVel.values.y ?? 0, z: angVel.values.z ?? 0 }, true);
                }
              }
            }
          }
        }
      },

      step: (inputs) => {
        const slotMap = new Map<number, number>();
        for (const arch of ecs.query(RegisteredNetworkSlot)) {
          const slots = arch.getColumnRead(RegisteredNetworkSlot, "slot") as Uint8Array;
          for (let i = 0; i < arch.entityCount; i++) {
            slotMap.set(slots[i], Number(arch.entityIds[i]));
          }
        }
        const playerIds = multiplayerSession.getOrderedPlayerIds();
        for (let slot = 0; slot < playerIds.length; slot++) {
          const entityId = slotMap.get(slot) as EntityID;
          if (entityId === undefined) continue;
          const input = inputs.get(playerIds[slot] as PlayerId);
          const mask = input?.[0] ?? 0;
          multiplayerSession.v2RemoteInputs.set(Number(entityId), mask);
        }
        update(1 / 60);
      },

      hash: () => {
        const snapshot = ecs.serialize(ignoredResources);
        snapshot.entities = snapshot.entities.filter(e =>
          e.components.some(c => c.componentKey === kartCompKey) ||
          e.components.some(c => c.componentKey === ufoCompKey)
        );
        const json = JSON.stringify(snapshot);
        let hash = 2166136261;
        for (let i = 0; i < json.length; i++) {
          hash ^= json.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
      },
    };

    multiplayerSession.setGameImpl(v2Game);
  }

  return {
    ui: () => UI,
    update: isMultiplayer ? undefined : update,
  };
}
