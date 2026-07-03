import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { System } from "./System";
import { CatmullRomCurve4, ComponentRegistry, entityGetComponentData, generateTrackCurve, obtainTrackPtNodes, RenderTrack, ShowAll, TrackState, TrackEvaluator, transformGetMatrix } from "@melty-karts/modelling";
import { Accessor, Component, createEffect, createMemo, createSignal, For, getOwner, mapArray, Match, onCleanup, onSettled, runWithOwner, Switch, untrack } from "solid-js";
import * as THREE from "three";
import { EntityID } from "@oasys/oecs";
import { Canvas, Entity, useFrame } from "solid-three";
import { WebGPURenderer } from "three/webgpu";
import RAPIER from "@dimforge/rapier3d";
import { DynamicRayCastVehicleController } from "@dimforge/rapier3d/control";
import { T } from "../t";
import { createKart } from "../Kart";
import { RegisteredFreeEntity, RegisteredKartConfig, RegisteredKeyboardInput, RegisteredOrientation, RegisteredPlayerConfig, RegisteredPosition, RegisteredVelocity } from "../World";
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

const SHOW_DEBUG_MESH = false;

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
  raceMusicRainbowWay.play();
  onCleanup(() => {
    raceMusicRainbowWay.stop();
  });
  let world = new RAPIER.World({ x: 0, y: -9.82, z: 0 });
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
    let s = { ...ecs.ecs.resource(RegisteredKeyboardInput) };
    if (params.upDown !== undefined) s.upDown = params.upDown ? 1 : 0;
    if (params.downDown !== undefined) s.downDown = params.downDown ? 1 : 0;
    if (params.leftDown !== undefined) s.leftDown = params.leftDown ? 1 : 0;
    if (params.rightDown !== undefined) s.rightDown = params.rightDown ? 1 : 0;
    if (params.actionDown !== undefined) s.actionDown = params.actionDown ? 1 : 0;
    ecs.set_resource(RegisteredKeyboardInput, s);
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
  let trackMinY: number = Number.NEGATIVE_INFINITY;
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
      {
        trackMinY = createTrackBody(world, curve.trackEval, track.track.width, 500, curve.curve).minY;
      }
      let frame = curve.trackEval.getFrameAt(0.0);
      camera()?.position.set(2, 2, 2).add(frame.position);
      let matrix = new THREE.Matrix4().makeBasis(
        frame.right,
        frame.up,
        frame.forward.clone().multiplyScalar(-1.0),
      );
      let q = new THREE.Quaternion().setFromRotationMatrix(matrix);
      let playerId2 = ecs.create_entity();
      {
        let ox = frame.position.x;
        let oy = frame.position.y + 0.5;
        let oz = frame.position.z;
        let qx = q.x;
        let qy = q.y;
        let qz = q.z;
        let qw = q.w;
        ecs.add_component(playerId2, componentRegistry.Transform3D, {
          ox, oy, oz, qx, qy, qz, qw,
        });
        ecs.add_component(playerId2, componentRegistry.LastTransform3D, {
          ox, oy, oz, qx, qy, qz, qw,
        });
      }
      ecs.add_component(playerId2, componentRegistry.Velocity, { x: 0.0, y: 0.0, z: 0.0, });
      ecs.add_component(playerId2, componentRegistry.AngularVelocity, { x: 0.0, y: 0.0, z: 0.0, });
      ecs.add_component(playerId2, componentRegistry.StillTime, { time: 0.0, });
      ecs.add_component(playerId2, RegisteredPlayerConfig, {
        playerType: 0,
        facingForward: 1,
        useItemWasDown: 0,
      });
      ecs.add_component(playerId2, RegisteredKartConfig, {
        speed: 0.0,
      });
      setPlayerId(playerId2);
      onCleanup(() => {
        ecs.destroy_entity_deferred(playerId2);
      });
    },
  );
  let ufoEntityIds = ecs.createQueryEntityIds(componentRegistry.Ufo, componentRegistry.Transform3D);
  let kartEntityIds = ecs.createQueryEntityIds(
    RegisteredKartConfig,
    componentRegistry.Transform3D,
    componentRegistry.Velocity,
    componentRegistry.AngularVelocity,
  );
  let kartsWithPhysics = createMemo(mapArray(
    kartEntityIds,
    (kartEntityId) => {
      let kartEntityId2 = untrack(kartEntityId);
      const wheelRadius = 0.25;
      const wheelPositions = [
        { x: -0.4, y: 0.35, z: 0.4 },  // Front Left
        { x: 0.4, y: 0.35, z: 0.4 },   // Front Right
        { x: -0.4, y: 0.35, z: -0.4 }, // Rear Left
        { x: 0.4, y: 0.35, z: -0.4 },  // Rear Right
      ];

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
        .setLinearDamping(0.1)
        .setAngularDamping(5.0)
        .setAdditionalMass(5.0);
      chassisDesc.centerOfMass = { x: 0, y: 0.08, z: 0.25 };
      const chassisBody = world.createRigidBody(chassisDesc);
      // Small, flat collider positioned at the body center
      // The visual mesh sits on top, wheels extend below
      const chassisCollider = RAPIER.ColliderDesc.cuboid(0.3, 0.2, 0.6)
        .setTranslation(0, 0.35, 0)
        .setRestitution(0.0)
        .setFriction(0.8);
      world.createCollider(chassisCollider, chassisBody);

      const broadPhase = world.broadPhase;
      const narrowPhase = world.narrowPhase;
      const bodies = world.bodies;
      const colliders = world.colliders;

      const vehicle = new DynamicRayCastVehicleController(
        chassisBody,
        broadPhase,
        narrowPhase,
        bodies,
        colliders
      );

      vehicle.indexUpAxis = 1;
      vehicle.setIndexForwardAxis = 2;

      const suspensionRestLength = 0.1;//0.35;

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

      onCleanup(() => {
        vehicle.free();
        world.removeRigidBody(chassisBody);
      });

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
        vehicle,
        wheelAxleDirs: wheelPositions.map(() => ({ x: -1, y: 0, z: 0 })),
        wheelMeshes,
      };
    },
  ));
  let rapierDebugRenderer: RapierDebugRenderer | undefined = undefined;
  let wheelMeshGroup = new THREE.Group();
  if (SHOW_DEBUG_MESH) {
    createEffect(
      scene,
      (scene) => {
        if (scene === undefined) {
          return;
        }
        rapierDebugRenderer = new RapierDebugRenderer(scene, world);
        scene.add(wheelMeshGroup);
        onCleanup(() => {
          scene.remove(wheelMeshGroup);
        });
      },
    )
  }
  let UI: Component = () => {
    return (
      <ShowAll whenAll={[ track, trackPtNodes, curve, ]}>
        {([ track, trackPtNodes, curve, ]) => (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <Canvas
              gl={(canvas) => new WebGPURenderer({ canvas })}
              ref={(ref) => {
                runWithOwner(null, () => {
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
  let maxSteerDeg = 30 * Math.PI / 180;
  let currentSteering = 0;
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
  let joystickAnalog = { x: 0, y: 0 };
  createEffect(
    joystick.value,
    (joyVal) => {
      joystickAnalog.x = joyVal.x;
      joystickAnalog.y = joyVal.y;
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
    let keyboard = ecs.ecs.resource(RegisteredKeyboardInput);
    for (let kartPhysics2 of kartsWithPhysics()) {
      const vehicle = kartPhysics2.vehicle;
      const chassisBody = vehicle.chassis();
      let rot = chassisBody.rotation();
      tmpQ1.set(rot.x, rot.y, rot.z, rot.w);
      let kartForward = new THREE.Vector3(0, 0, 1).applyQuaternion(rot);
      let kartVel = new THREE.Vector3().copy(chassisBody.linvel());
      let kartForwardSpeed = kartForward.dot(kartVel);

      let engineForce = 0.0;
      let steering = 0.0;

      let actionPressed = keyboard.actionDown !== 0 || actionButton.pressed() || actionButton2.pressed();

      if (keyboard.upDown !== 0 || actionPressed) {
        engineForce = 1.0;
      } else if (keyboard.downDown !== 0 || joystickAnalog.y > 0.3) {
        engineForce = -0.25;
      }

      const KART_MAX_SPEED = 50.0;
      let maxSpeedFactor = 1.0 - Math.max(0.0, Math.min(1.0, kartForwardSpeed / KART_MAX_SPEED));
      engineForce *= maxSpeedFactor;

      let targetSteering = 0;
      if (Math.abs(joystickAnalog.x) > 0.1) {
        targetSteering = -joystickAnalog.x * 2.0 * maxSteerDeg;
      } else {
        if (keyboard.leftDown !== 0) {
          targetSteering = maxSteerDeg;
        }
        if (keyboard.rightDown !== 0) {
          targetSteering = -maxSteerDeg;
        }
      }
      steering = currentSteering += (targetSteering - currentSteering) * Math.min(1, steeringLerpSpeed * dt);

      /*
      // Apply engine force to rear wheels (2 and 3) for driving
      for (let i = 2; i < vehicle.numWheels(); i++) {
        vehicle.setWheelEngineForce(i, engineForce);
      }*/
      if (
        vehicle.wheelIsInContact(2) ||
        vehicle.wheelIsInContact(3)
      ) {
        vehicle.chassis().applyImpulse(
          {
            x: kartForward.x * engineForce,
            y: kartForward.y * engineForce,
            z: kartForward.z * engineForce,
          },
          true,
        );
      }
      // Apply steering to front wheels (0 and 1)
      for (let i = 0; i <= 1; i++) {
        vehicle.setWheelSteering(i, steering);
      }
    }
    let tmp = dt;
    while (tmp > 0.0) {
      const fixedDt = 1 / (60 * 5);
      tmp -= fixedDt;
      world.timestep = fixedDt;
      for (let kartPhysics2 of kartsWithPhysics()) {
        kartPhysics2.vehicle.updateVehicle(fixedDt);
      }
      world.step();
    }
    rapierDebugRenderer?.update();
    for (let kartPhysics2 of kartsWithPhysics()) {
      let entityId = kartPhysics2.kartEntityId;
      let chassisBody = kartPhysics2.vehicle.chassis();
      let pos = chassisBody.translation();
      let rot = chassisBody.rotation();
      let vel = chassisBody.linvel();
      let angVel = chassisBody.angvel();
      ecs.set_field(
        entityId,
        componentRegistry.Transform3D,
        "ox",
        pos.x,
      );
      ecs.set_field(
        entityId,
        componentRegistry.Transform3D,
        "oy",
        pos.y,
      );
      ecs.set_field(
        entityId,
        componentRegistry.Transform3D,
        "oz",
        pos.z,
      );
      ecs.set_field(
        entityId,
        componentRegistry.Transform3D,
        "qx",
        rot.x,
      );
      ecs.set_field(
        entityId,
        componentRegistry.Transform3D,
        "qy",
        rot.y,
      );
      ecs.set_field(
        entityId,
        componentRegistry.Transform3D,
        "qz",
        rot.z,
      );
      ecs.set_field(
        entityId,
        componentRegistry.Transform3D,
        "qw",
        rot.w,
      );
      ecs.set_field(
        entityId,
        componentRegistry.Velocity,
        "x",
        vel.x,
      );
      ecs.set_field(
        entityId,
        componentRegistry.Velocity,
        "y",
        vel.y,
      );
      ecs.set_field(
        entityId,
        componentRegistry.Velocity,
        "z",
        vel.z,
      );
      ecs.set_field(
        entityId,
        componentRegistry.AngularVelocity,
        "x",
        angVel.x,
      );
      ecs.set_field(
        entityId,
        componentRegistry.AngularVelocity,
        "y",
        angVel.y,
      );
      ecs.set_field(
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
        let lastOx = ecs.ecs.get_field(entityId, componentRegistry.LastTransform3D, "ox");
        let lastOy = ecs.ecs.get_field(entityId, componentRegistry.LastTransform3D, "oy");
        let lastOz = ecs.ecs.get_field(entityId, componentRegistry.LastTransform3D, "oz");
        let lastQx = ecs.ecs.get_field(entityId, componentRegistry.LastTransform3D, "qx");
        let lastQy = ecs.ecs.get_field(entityId, componentRegistry.LastTransform3D, "qy");
        let lastQz = ecs.ecs.get_field(entityId, componentRegistry.LastTransform3D, "qz");
        let lastQw = ecs.ecs.get_field(entityId, componentRegistry.LastTransform3D, "qw");
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
          ecs.set_field(entityId, componentRegistry.StillTime, "time", 0.0);
          ecs.set_field(entityId, componentRegistry.LastTransform3D, "ox", pos.x);
          ecs.set_field(entityId, componentRegistry.LastTransform3D, "oy", pos.y);
          ecs.set_field(entityId, componentRegistry.LastTransform3D, "oz", pos.z);
          ecs.set_field(entityId, componentRegistry.LastTransform3D, "qx", rot.x);
          ecs.set_field(entityId, componentRegistry.LastTransform3D, "qy", rot.y);
          ecs.set_field(entityId, componentRegistry.LastTransform3D, "qz", rot.z);
          ecs.set_field(entityId, componentRegistry.LastTransform3D, "qw", rot.w);
        } else {
          let stillTime = ecs.ecs.get_field(entityId, componentRegistry.StillTime, "time");
          if (stillTime >= 5.0) {
            sendUfo = true;
          } else {
            stillTime += dt;
            ecs.set_field(entityId, componentRegistry.StillTime, "time", stillTime);
          }
        }
        if (sendUfo) {
          console.log("Send the UFO!");
          let ufoEntityId = getFreeEntityOrCreate(ecs);
          ecs.set_field(entityId, componentRegistry.StillTime, "time", 0.0);
          ecs.add_component(entityId, componentRegistry.UfoTarget, {
            ufo: ufoEntityId,
          });
          ecs.add_component(
            ufoEntityId,
            componentRegistry.Ufo,
            {
              stage: UfoStage.CHASING_KART,
              target: entityId,
              timeout: 0,
            },
          );
          ecs.add_component(
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
          ecs.set_field(entityId, componentRegistry.Velocity, "x", 0.0);
          ecs.set_field(entityId, componentRegistry.Velocity, "y", 0.0);
          ecs.set_field(entityId, componentRegistry.Velocity, "z", 0.0);
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
      let query = ecs.ecs.query(componentRegistry.Ufo, componentRegistry.Transform3D);
      for (let i = 0; i < query.archetype_count; ++i) {
        let arch = query.archetypes[i];
        for (let j = 0; j < arch.entity_count; ++j) {
          let ufoEntityId = arch.entity_ids[j] as EntityID;
          let ufoStage = ecs.ecs.get_field(ufoEntityId, componentRegistry.Ufo, "stage") as UfoStage;
          let targetEntityId = ecs.ecs.get_field(ufoEntityId, componentRegistry.Ufo, "target") as EntityID;
          let ufoPosX = ecs.ecs.get_field(ufoEntityId, componentRegistry.Transform3D, "ox");
          let ufoPosY = ecs.ecs.get_field(ufoEntityId, componentRegistry.Transform3D, "oy");
          let ufoPosZ = ecs.ecs.get_field(ufoEntityId, componentRegistry.Transform3D, "oz");
          let targetPosX = ecs.ecs.get_field(targetEntityId, componentRegistry.Transform3D, "ox");
          let targetPosY = ecs.ecs.get_field(targetEntityId, componentRegistry.Transform3D, "oy");
          let targetPosZ = ecs.ecs.get_field(targetEntityId, componentRegistry.Transform3D, "oz");
          switch (ufoStage) {
            case UfoStage.CHASING_KART: {
              let dx = (targetPosX - ufoPosX);
              let dy = (targetPosY + 4.0 - ufoPosY);
              let dz = (targetPosZ - ufoPosZ);
              ufoPosX += dx * 0.02;
              ufoPosY += dy * 0.02;
              ufoPosZ += dz * 0.02;
              ecs.set_field(ufoEntityId, componentRegistry.Transform3D, "ox", ufoPosX);
              ecs.set_field(ufoEntityId, componentRegistry.Transform3D, "oy", ufoPosY);
              ecs.set_field(ufoEntityId, componentRegistry.Transform3D, "oz", ufoPosZ);
              let d = dx * dx + dy * dy + dz * dz;
              if (d <= 0.1 * 0.1) {
                ecs.set_field(ufoEntityId, componentRegistry.Ufo, "stage", UfoStage.BEAMING_UP_KART);
                ecs.set_field(ufoEntityId, componentRegistry.Ufo, "timeout", UFO_BEAMING_TIMEOUT);
              }
              break;
            }
            case UfoStage.BEAMING_UP_KART: {
              let timeout = ecs.ecs.get_field(ufoEntityId, componentRegistry.Ufo, "timeout");
              timeout -= dt;
              let a = Math.max(0, 1 - timeout / UFO_BEAMING_TIMEOUT);
              targetPosX += a * (ufoPosX - targetPosX);
              targetPosY += a * (ufoPosY - targetPosY);
              targetPosZ += a * (ufoPosZ - targetPosZ);
              ecs.set_field(targetEntityId, componentRegistry.Transform3D, "ox", targetPosX);
              ecs.set_field(targetEntityId, componentRegistry.Transform3D, "oy", targetPosY);
              ecs.set_field(targetEntityId, componentRegistry.Transform3D, "oz", targetPosZ);
              ecs.set_field(targetEntityId, componentRegistry.Velocity, "x", 0.0);
              ecs.set_field(targetEntityId, componentRegistry.Velocity, "y", 0.0);
              ecs.set_field(targetEntityId, componentRegistry.Velocity, "z", 0.0);
              ecs.set_field(targetEntityId, componentRegistry.AngularVelocity, "x", 0.0);
              ecs.set_field(targetEntityId, componentRegistry.AngularVelocity, "y", 0.0);
              ecs.set_field(targetEntityId, componentRegistry.AngularVelocity, "z", 0.0);
              if (timeout > 0.0) {
                ecs.set_field(ufoEntityId, componentRegistry.Ufo, "timeout", timeout);
              } else {
                ecs.set_field(ufoEntityId, componentRegistry.Ufo, "timeout", 0.0);
                ecs.set_field(ufoEntityId, componentRegistry.Ufo, "stage", UfoStage.MOVING_KART);
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
                ecs.set_field(targetEntityId, componentRegistry.Transform3D, "ox", targetPosX);
                ecs.set_field(targetEntityId, componentRegistry.Transform3D, "oy", targetPosY);
                ecs.set_field(targetEntityId, componentRegistry.Transform3D, "oz", targetPosZ);
                ecs.set_field(ufoEntityId, componentRegistry.Transform3D, "ox", ufoPosX);
                ecs.set_field(ufoEntityId, componentRegistry.Transform3D, "oy", ufoPosY);
                ecs.set_field(ufoEntityId, componentRegistry.Transform3D, "oz", ufoPosZ);
                let d = dx * dx + dy * dy + dz * dz;
                if (d <= 0.1 * 0.1) {
                  ecs.set_field(ufoEntityId, componentRegistry.Ufo, "stage", UfoStage.BEAMING_DOWN_KART);
                  ecs.set_field(ufoEntityId, componentRegistry.Ufo, "timeout", UFO_BEAMING_TIMEOUT);
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
                let timeout = ecs.ecs.get_field(ufoEntityId, componentRegistry.Ufo, "timeout");
                timeout -= dt;
                let a = Math.max(0, 1 - timeout / UFO_BEAMING_TIMEOUT);
                targetPosX += a * (ufoPosX - targetPosX);
                targetPosY += a * (ufoPosY - 2.0 - targetPosY);
                targetPosZ += a * (ufoPosZ - targetPosZ);
                let ufoRotX = ecs.ecs.get_field(ufoEntityId, componentRegistry.Transform3D, "qx");
                let ufoRotY = ecs.ecs.get_field(ufoEntityId, componentRegistry.Transform3D, "qy");
                let ufoRotZ = ecs.ecs.get_field(ufoEntityId, componentRegistry.Transform3D, "qz");
                let ufoRotW = ecs.ecs.get_field(ufoEntityId, componentRegistry.Transform3D, "qw");
                let q = new THREE.Quaternion(ufoRotX, ufoRotY, ufoRotZ, ufoRotW);
                q.slerp(rot, Math.min(1.0, 3.0 * dt));
                ufoRotX = q.x;
                ufoRotY = q.y;
                ufoRotZ = q.z;
                ufoRotW = q.w;
                ecs.set_field(ufoEntityId, componentRegistry.Transform3D, "qx", ufoRotX);
                ecs.set_field(ufoEntityId, componentRegistry.Transform3D, "qy", ufoRotY);
                ecs.set_field(ufoEntityId, componentRegistry.Transform3D, "qz", ufoRotZ);
                ecs.set_field(ufoEntityId, componentRegistry.Transform3D, "qw", ufoRotW);
                ecs.set_field(targetEntityId, componentRegistry.Transform3D, "ox", targetPosX);
                ecs.set_field(targetEntityId, componentRegistry.Transform3D, "oy", targetPosY);
                ecs.set_field(targetEntityId, componentRegistry.Transform3D, "oz", targetPosZ);
                ecs.set_field(targetEntityId, componentRegistry.Transform3D, "qx", rot.x);
                ecs.set_field(targetEntityId, componentRegistry.Transform3D, "qy", rot.y);
                ecs.set_field(targetEntityId, componentRegistry.Transform3D, "qz", rot.z);
                ecs.set_field(targetEntityId, componentRegistry.Transform3D, "qw", rot.w);
                ecs.set_field(targetEntityId, componentRegistry.Velocity, "x", 0.0);
                ecs.set_field(targetEntityId, componentRegistry.Velocity, "y", 0.0);
                ecs.set_field(targetEntityId, componentRegistry.Velocity, "z", 0.0);
                ecs.set_field(targetEntityId, componentRegistry.AngularVelocity, "x", 0.0);
                ecs.set_field(targetEntityId, componentRegistry.AngularVelocity, "y", 0.0);
                ecs.set_field(targetEntityId, componentRegistry.AngularVelocity, "z", 0.0);
                if (timeout > 0.0) {
                  ecs.set_field(ufoEntityId, componentRegistry.Ufo, "timeout", timeout);
                } else {
                  ecs.set_field(ufoEntityId, componentRegistry.Ufo, "stage", UfoStage.FLY_OFF);
                  ecs.set_field(ufoEntityId, componentRegistry.Ufo, "timeout", UFO_FLY_OFF_TIMEOUT);
                  ecs.remove_component(targetEntityId, componentRegistry.UfoTarget);
                }
              }
              break;
            }
            case UfoStage.FLY_OFF: {
              let timeout = ecs.ecs.get_field(ufoEntityId, componentRegistry.Ufo, "timeout");
              timeout -= dt;
              ufoPosY += 20.0 * dt;
              ecs.set_field(ufoEntityId, componentRegistry.Transform3D, "oy", ufoPosY);
              if (timeout > 0.0) {
                ecs.set_field(ufoEntityId, componentRegistry.Ufo, "timeout", timeout);
              } else {
                ecs.remove_component(ufoEntityId, componentRegistry.Ufo);
                ecs.remove_component(ufoEntityId, componentRegistry.Transform3D);
                ecs.add_component(ufoEntityId, RegisteredFreeEntity);
              }
              break;
            }
          }
        }
      }
    }
    // camera chase player
    let camera2 = camera();
    let playerId2 = playerId();
    if (camera2 !== undefined && playerId2 !== undefined) {
      let playerPosX = ecs.ecs.get_field(
        playerId2,
        componentRegistry.Transform3D,
        "ox",
      );
      let playerPosY = ecs.ecs.get_field(
        playerId2,
        componentRegistry.Transform3D,
        "oy",
      );
      let playerPosZ = ecs.ecs.get_field(
        playerId2,
        componentRegistry.Transform3D,
        "oz",
      );
      let playerOrientX = ecs.ecs.get_field(
        playerId2,
        componentRegistry.Transform3D,
        "qx",
      );
      let playerOrientY = ecs.ecs.get_field(
        playerId2,
        componentRegistry.Transform3D,
        "qy",
      );
      let playerOrientZ = ecs.ecs.get_field(
        playerId2,
        componentRegistry.Transform3D,
        "qz",
      );
      let playerOrientW = ecs.ecs.get_field(
        playerId2,
        componentRegistry.Transform3D,
        "qw",
      );
      if (ecs.ecs.has_component(playerId2, componentRegistry.UfoTarget)) {
        let ufoId = ecs.ecs.get_field(playerId2, componentRegistry.UfoTarget, "ufo") as EntityID;
        let ufoPosX = ecs.ecs.get_field(ufoId, componentRegistry.Transform3D, "ox");
        let ufoPosY = ecs.ecs.get_field(ufoId, componentRegistry.Transform3D, "oy");
        let ufoPosZ = ecs.ecs.get_field(ufoId, componentRegistry.Transform3D, "oz");
        let ufoOrientX = ecs.ecs.get_field(ufoId, componentRegistry.Transform3D, "qx");
        let ufoOrientY = ecs.ecs.get_field(ufoId, componentRegistry.Transform3D, "qy");
        let ufoOrientZ = ecs.ecs.get_field(ufoId, componentRegistry.Transform3D, "qz");
        let ufoOrientW = ecs.ecs.get_field(ufoId, componentRegistry.Transform3D, "qw");
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
  };
  return {
    ui: () => UI,
    update,
  };
}
