import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { System } from "./System";
import { ComponentRegistry, entityGetComponentData, generateTrackCurve, obtainTrackPtNodes, RenderTrack, ShowAll, TrackState, TrackEvaluator } from "@melty-karts/modelling";
import { Component, createMemo, getOwner, onCleanup, onSettled, runWithOwner } from "solid-js";
import * as THREE from "three";
import { EntityID } from "@oasys/oecs";
import { Canvas, useFrame } from "solid-three";
import * as CANNON from "cannon-es";
import { T } from "../t";

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
    state.camera.position.lerp(
      new THREE.Vector3(pos.x + 6, pos.y + 9, pos.z + 15),
      0.05,
    );
    state.camera.lookAt(pos.x, pos.y, pos.z);
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
  let track = createMemo(() => {
    let query = ecs.query(
      componentRegistry.Track
    );
    let result: {
      entityId: EntityID,
      track: TrackState,
    } | undefined = undefined;
    for (let arch of query) {
      for (let i = 0; i < arch.entity_count; ++i) {
        let entityId = arch.entity_ids[i] as EntityID;
        let trackState = entityGetComponentData(ecs, entityId, componentRegistry.Track);
        if (trackState === undefined) {
          continue;
        }
        if (result !== undefined) {
          return undefined;
        }
        result = {
          entityId,
          track: trackState
        };
      }
    }
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
  let UI: Component = () => {
    return (
      <ShowAll whenAll={[ track, trackPtNodes, curve, ]}>
        {([ track, trackPtNodes, curve, ]) => (
          <Canvas
            ref={(ref) => {
              ref.camera.position.set(5, 5, 5);
              ref.camera.lookAt(new THREE.Vector3(0.0, 0.0, 0.0));
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
            <VehicleController
              trackEval={curve().trackEval}
              trackWidth={track().track.width}
              numSegments={Math.max(4, Math.ceil(curve().length / 0.5))}
            />
          </Canvas>
        )}
      </ShowAll>
    );
  };
  return {
    ui: () => UI,
  };
}
