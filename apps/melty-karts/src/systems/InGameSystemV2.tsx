import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { System } from "./System";
import { ComponentRegistry, entityGetComponentData, generateTrackCurve, obtainTrackPtNodes, RenderTrack, ShowAll, TrackState, TrackEvaluator, transformGetMatrix } from "@melty-karts/modelling";
import { Accessor, Component, createEffect, createMemo, createSignal, For, getOwner, mapArray, Match, onCleanup, onSettled, runWithOwner, Switch, untrack } from "solid-js";
import * as THREE from "three";
import { EntityID } from "@oasys/oecs";
import { Canvas, Entity, useFrame } from "solid-three";
import { WebGPURenderer } from "three/webgpu";
import * as CANNON from "cannon-es";
import { T } from "../t";
import { createKart } from "../Kart";
import { RegisteredKartConfig, RegisteredOrientation, RegisteredPlayerConfig, RegisteredPosition, RegisteredVelocity } from "../World";
import { loadKartModel } from "../models/Kart";
import Melty from "../models/melty";
import { createCubey } from "../models/cubey";
import { createSolidLogo } from "../models/SolidLogo";
import CannonDebugger from "cannon-es-debugger";
import { OrbitControls } from "three-stdlib";

function generateTrackCollisionVertices(
  trackEval: TrackEvaluator,
  trackWidth: number,
  numSegments: number,
): { vertices: number[]; indices: number[] } {
  const halfWidth = trackWidth / 2;
  const segments = numSegments;
  const N = segments + 1;
  const wallHeight = 1.5;

  const vertices: number[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / segments;
    const f = trackEval.getFrameAt(t);
    const lx = f.position.x - halfWidth * f.right.x;
    const ly = f.position.y - halfWidth * f.right.y;
    const lz = f.position.z - halfWidth * f.right.z;
    const rx = f.position.x + halfWidth * f.right.x;
    const ry = f.position.y + halfWidth * f.right.y;
    const rz = f.position.z + halfWidth * f.right.z;
    vertices.push(lx, ly, lz, rx, ry, rz);
  }

  for (let i = 0; i < N; i++) {
    const t = i / segments;
    const f = trackEval.getFrameAt(t);
    const lx = f.position.x - halfWidth * f.right.x;
    const ly = f.position.y - halfWidth * f.right.y;
    const lz = f.position.z - halfWidth * f.right.z;
    const rx = f.position.x + halfWidth * f.right.x;
    const ry = f.position.y + halfWidth * f.right.y;
    const rz = f.position.z + halfWidth * f.right.z;
    vertices.push(
      lx + wallHeight * f.up.x, ly + wallHeight * f.up.y, lz + wallHeight * f.up.z,
      rx + wallHeight * f.up.x, ry + wallHeight * f.up.y, rz + wallHeight * f.up.z,
    );
  }

  const indices: number[] = [];
  for (let i = 0; i < segments; i++) {
    const sL0 = i * 2, sR0 = i * 2 + 1;
    const sL1 = (i + 1) * 2, sR1 = (i + 1) * 2 + 1;
    const wL0 = 2 * N + i * 2, wR0 = 2 * N + i * 2 + 1;
    const wL1 = 2 * N + (i + 1) * 2, wR1 = 2 * N + (i + 1) * 2 + 1;
    indices.push(sL0, sL1, sR0);
    indices.push(sL1, sR1, sR0);
    indices.push(sL0, wL0, sL1);
    indices.push(wL0, wL1, sL1);
    indices.push(sR0, sR1, wR0);
    indices.push(sR1, wR1, wR0);
  }

  return { vertices, indices };
}

function createTrackBody(
  trackEval: TrackEvaluator,
  trackWidth: number,
  numSegments: number,
): CANNON.Body {
  const { vertices, indices } = generateTrackCollisionVertices(trackEval, trackWidth, numSegments);
  const shape = new CANNON.Trimesh(vertices, indices);
  const body = new CANNON.Body({ mass: 0 });
  body.addShape(shape);
  return body;
}

function VehicleController(props: {
  trackEval: TrackEvaluator;
  trackWidth: number;
  numSegments: number;
}) {
  let world: CANNON.World;
  let body: CANNON.Body;
  let trackBody: CANNON.Body;
  let mesh: THREE.Mesh | undefined;

  const collisionGeom = (() => {
    const { vertices, indices } = generateTrackCollisionVertices(
      props.trackEval, props.trackWidth, props.numSegments,
    );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertices), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    geometry.computeVertexNormals();
    return geometry;
  })();

  let owner = getOwner();

  onSettled(() => {
    world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    world.defaultContactMaterial.restitution = 0.2;
    world.defaultContactMaterial.friction = 0.1;

    trackBody = createTrackBody(props.trackEval, props.trackWidth, props.numSegments);
    world.addBody(trackBody);

    const s0 = props.trackEval.getFrameAt(0);
    const s1 = props.trackEval.getFrameAt(1 / 200);
    const sf = props.trackEval.getFrameAt(0.5 / 200);
    console.log("t=0 pos:", s0.position.x.toFixed(2), s0.position.y.toFixed(2), s0.position.z.toFixed(2));
    console.log("t=0.005 pos:", s1.position.x.toFixed(2), s1.position.y.toFixed(2), s1.position.z.toFixed(2));
    console.log("sf pos:", sf.position.x.toFixed(2), sf.position.y.toFixed(2), sf.position.z.toFixed(2));
    console.log("sf up:", sf.up.x.toFixed(4), sf.up.y.toFixed(4), sf.up.z.toFixed(4));

    body = new CANNON.Body({ mass: 5, linearDamping: 0.0, angularDamping: 0.0 });
    body.addShape(new CANNON.Sphere(0.5));
    body.position.set(sf.position.x, sf.position.y + 0.55, sf.position.z);
    world.addBody(body);

    runWithOwner(owner, () => {
      onCleanup(() => {
        world.removeBody(body);
        world.removeBody(trackBody);
      });
    });
  });

  let frameCount = 0;
  useFrame((state, dt) => {
    if (!world || !body) return;
    world.step(1 / 60, Math.min(dt, 0.1), 20);
    const pos = body.position;
    if (mesh) {
      mesh.position.set(pos.x, pos.y, pos.z);
    }
    frameCount++;
    if (frameCount % 30 === 0) {
      const speed = Math.sqrt(body.velocity.x**2 + body.velocity.y**2 + body.velocity.z**2);
      console.log(`frame=${frameCount} pos=(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}) speed=${speed.toFixed(2)} vel=(${body.velocity.x.toFixed(2)}, ${body.velocity.y.toFixed(2)}, ${body.velocity.z.toFixed(2)})`);
    }
    /*
    state.camera.position.lerp(
      new THREE.Vector3(pos.x + 6, pos.y + 9, pos.z + 15),
      0.05,
    );
    state.camera.lookAt(pos.x, pos.y, pos.z);
    */
  });

  return (
    <>
      <T.Mesh geometry={collisionGeom}>
        <T.MeshBasicMaterial
          args={[{
            color: 0x00ff00,
            transparent: true,
            opacity: 0.25,
            depthWrite: false,
            side: THREE.DoubleSide,
          }]}
        />
      </T.Mesh>
      <T.Mesh ref={(m: THREE.Mesh) => { mesh = m; }}>
        <T.SphereGeometry args={[0.5]} />
        <T.MeshStandardMaterial color="#e03030" />
      </T.Mesh>
    </>
  );
}

export function createInGameSystemV2(
  componentRegistry: ComponentRegistry,
  ecs: ReactiveECS,
): System {
  let world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.defaultContactMaterial.restitution = 0.2;
  world.defaultContactMaterial.friction = 0.1;
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
  let [ orbitControls, setOrbitControls, ] = createSignal<OrbitControls>();
  createEffect(
    () => [ track(), curve(), ] as const,
    ([ track, curve, ]) => {
      if (track === undefined) {
        return;
      }
      if (curve === undefined) {
        return;
      }
      {
        let trackBody = createTrackBody(curve.trackEval, track.track.width, 200);
        world.addBody(trackBody);
      }
      let frame = curve.trackEval.getFrameAt(0.0);
      let matrix = new THREE.Matrix4().makeBasis(
        frame.right,
        frame.up,
        frame.forward.clone().multiplyScalar(-1.0),
      );
      let q = new THREE.Quaternion().setFromRotationMatrix(matrix);
      let playerId2 = ecs.create_entity();
      ecs.add_component(playerId2, componentRegistry.Transform3D, {
        ox: frame.position.x,
        oy: frame.position.y + 0.7,
        oz: frame.position.z,
        qx: q.x,
        qy: q.y,
        qz: q.z,
        qw: q.w,
      });
      ecs.add_component(playerId2, RegisteredVelocity, {
        x: 0.0,
        y: 0.0,
        z: 0.0,
      });
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
  let kartEntityIds = ecs.createQueryEntityIds(
    componentRegistry.Transform3D,
    RegisteredVelocity,
    RegisteredKartConfig,
  );
  let kartsWithCannonBodies = createMemo(mapArray(
    kartEntityIds,
    (kartEntityId) => {
      let kartEntityId2 = untrack(kartEntityId);
      const chassisShape = new CANNON.Box(new CANNON.Vec3(0.35, 0.2, 0.35));
      const chassisBody = new CANNON.Body({ mass: 1.0 });
      chassisBody.shapeOffsets.push(new CANNON.Vec3(0, 0.5, 0));
      chassisBody.addShape(chassisShape);
      untrack(() => {
        let transform = entityGetComponentData(ecs, kartEntityId2, componentRegistry.Transform3D);
        if (transform !== undefined) {
          chassisBody.position.set(
            transform.ox,
            transform.oy,
            transform.oz,
          );
          chassisBody.quaternion.set(
            transform.qx,
            transform.qy,
            transform.qz,
            transform.qw,
          );
        }
      });
      const vehicle = new CANNON.RigidVehicle({ chassisBody });
      const wheelRadius = 0.18;
      const wheelShape = new CANNON.Sphere(wheelRadius);
      const wheelMaterial = new CANNON.Material("wheel");
      const wheelAxis = new CANNON.Vec3(1, 0, 0);
      const wheelPositions = [
        new CANNON.Vec3(-0.38, 0.18, 0.38),  // Front Left
        new CANNON.Vec3(0.38, 0.18, 0.38),   // Front Right
        new CANNON.Vec3(-0.38, 0.18, -0.38), // Rear Left
        new CANNON.Vec3(0.38, 0.18, -0.38),  // Rear Right
      ];
      wheelPositions.forEach((position) => {
        const wheelBody = new CANNON.Body({ 
          mass: 0.2,
          material: wheelMaterial 
        });
        wheelBody.addShape(wheelShape);
        wheelBody.angularDamping = 0;
        vehicle.addWheel({
          body: wheelBody,
          position: position,
          axis: wheelAxis,
          direction: wheelAxis,
        });
      });
      vehicle.addToWorld(world);
      onCleanup(() => {
        vehicle.removeFromWorld(world);
      });
      return {
        kartEntityId: kartEntityId2,
        cannonBody: vehicle,
      };
    },
  ));
  let cannonDebugger: any | undefined = undefined;
  createEffect(
    scene,
    (scene) => {
      if (scene === undefined) {
        return;
      }
      cannonDebugger = new (CannonDebugger as any)(scene, world, {
        color: 0x00ff00, // Optional: change wireframe color (defaults to green)
        scale: 1         // Optional: scale the wireframes if needed
      });
    },
  )
   let UI: Component = () => {
    return (
      <ShowAll whenAll={[ track, trackPtNodes, curve, ]}>
        {([ track, trackPtNodes, curve, ]) => (
          <Canvas
            gl={(canvas) => new WebGPURenderer({ canvas })}
            ref={(ref) => {
              runWithOwner(null, () => {
                ref.camera.position.set(5, 5, 5);
                ref.camera.lookAt(new THREE.Vector3(0.0, 0.0, 0.0));
                let orbitControls2 = new OrbitControls(ref.camera, ref.canvas);
                setScene(ref.scene);
                setCamera(ref.camera);
                setOrbitControls(orbitControls2);
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
            <For each={kartsWithCannonBodies()}>
              {(kartWithCannonBody) => {
                let kartWithCannonBody2 = untrack(kartWithCannonBody);
                let kartEntityId = kartWithCannonBody2.kartEntityId;
                let cannonBody = kartWithCannonBody2.cannonBody;
                cannonBody.chassisBody.shapes[0];
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
          </Canvas>
        )}
      </ShowAll>
    );
  };
  let tmpV1 = new THREE.Vector3();
  let tmpV2 = new THREE.Vector3();
  let tmpQ1 = new THREE.Quaternion();
  let update = (dt: number) => {
    for (let kartWithCannonBody of kartsWithCannonBodies()) {
      let entityId = kartWithCannonBody.kartEntityId;
      let cannonBody = kartWithCannonBody.cannonBody;
      let transform = entityGetComponentData(ecs, entityId, componentRegistry.Transform3D);
      if (transform !== undefined) {
        cannonBody.chassisBody.position.set(
          transform.ox,
          transform.oy,
          transform.oz,
        );
        cannonBody.chassisBody.quaternion.set(
          transform.qx,
          transform.qy,
          transform.qz,
          transform.qw,
        );
      }
    }
    for (let i = 0; i < 5; ++i) {
      world.step(1 / 60 / 5, 1 / 60 / 5, 20);
    }
    cannonDebugger?.update();
    for (let kartWithCannonBody of kartsWithCannonBodies()) {
      let entityId = kartWithCannonBody.kartEntityId;
      let cannonBody = kartWithCannonBody.cannonBody;
      ecs.set_field(
        entityId,
        componentRegistry.Transform3D,
        "ox",
        cannonBody.chassisBody.position.x,
      );
      ecs.set_field(
        entityId,
        componentRegistry.Transform3D,
        "oy",
        cannonBody.chassisBody.position.y,
      );
      ecs.set_field(
        entityId,
        componentRegistry.Transform3D,
        "oz",
        cannonBody.chassisBody.position.z,
      );
      ecs.set_field(
        entityId,
        componentRegistry.Transform3D,
        "qx",
        cannonBody.chassisBody.quaternion.x,
      );
      ecs.set_field(
        entityId,
        componentRegistry.Transform3D,
        "qy",
        cannonBody.chassisBody.quaternion.y,
      );
      ecs.set_field(
        entityId,
        componentRegistry.Transform3D,
        "qz",
        cannonBody.chassisBody.quaternion.z,
      );
      ecs.set_field(
        entityId,
        componentRegistry.Transform3D,
        "qw",
        cannonBody.chassisBody.quaternion.w,
      );
    }
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
      tmpV1.set(playerPosX, playerPosY, playerPosZ);
      tmpQ1.set(playerOrientX, playerOrientY, playerOrientZ, playerOrientW);
      tmpV2.set(0, 3, -5).applyQuaternion(tmpQ1).add(tmpV1);
      tmpQ1.conjugate();
      //camera2.position.lerp(tmpV2, 0.05);
      //camera2.quaternion.slerp(tmpQ1, 0.05);
      //camera2.lookAt(tmpV1);
      let orbitControls2 = orbitControls();
      if (orbitControls2 !== undefined) {
        orbitControls2.target.copy(tmpV1);
        orbitControls2.update();
      }
    }
  };
  return {
    ui: () => UI,
    update,
  };
}
