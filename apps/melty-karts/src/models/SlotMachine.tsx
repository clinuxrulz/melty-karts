import { Component, createRenderEffect, createMemo, For, Match, onCleanup, Switch } from "solid-js";
import { T } from "../t";
import Bomb from "./Bomb";
import Lightning from "./Lightning";
import { createBanana } from "./banana";
import { Entity } from "solid-three";
import { useFrame } from "solid-three";
import * as THREE from "three";

function applyClippingPlanesToObject(object: THREE.Object3D | undefined, clippingPlanes: THREE.Plane[]) {
  if (object === undefined) {
    return;
  }
  object.traverse((child) => {
    const child2 = child as THREE.Mesh | THREE.Points;
    const material = child2.material;
    if (material === undefined) {
      return;
    }
    const materials = Array.isArray(material) ? material : [ material ];
    for (const material2 of materials) {
      let needsUpdate = false;
      if (material2.clippingPlanes !== clippingPlanes) {
        material2.clippingPlanes = clippingPlanes;
        needsUpdate = true;
      }
      if (material2.clipShadows !== true) {
        material2.clipShadows = true;
        needsUpdate = true;
      }
      if (material2 instanceof THREE.ShaderMaterial) {
        if (material2.clipping !== true) {
          material2.clipping = true;
          needsUpdate = true;
        }
      }
      if (needsUpdate) {
        material2.needsUpdate = true;
      }
    }
  });
}

const SlotMachine: Component<{
  time: number,
}> = (props) => {
  let banana = createBanana();
  let slotGroup: THREE.Group | undefined;
  const clippedSymbolGroups: Array<THREE.Object3D | undefined> = [];
  let yPos = createMemo(() => 4.0 - (props.time * 2 % 3.0));
  let geometry = new THREE.BoxGeometry().toNonIndexed(); // Convert to non-indexed
  const posAttr = geometry.getAttribute("position");
  const filteredPositions = [];
  for (let i = 0; i < posAttr.count; i += 3) {
    const z1 = posAttr.getZ(i);
    const z2 = posAttr.getZ(i + 1);
    const z3 = posAttr.getZ(i + 2);
    if (!(z1 > -0.4 && z2 > -0.4 && z3 > -0.4)) {
      for (let j = 0; j < 3; j++) {
        filteredPositions.push(posAttr.getX(i+j), posAttr.getY(i+j), posAttr.getZ(i+j));
      }
    }
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(filteredPositions, 3));
  geometry.computeVertexNormals();
  const clipTemplatePlanes = [
    new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(1.0, 0.0, 0.0), new THREE.Vector3(-0.5, 0.0, 0.0)),
    new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(-1.0, 0.0, 0.0), new THREE.Vector3(0.5, 0.0, 0.0)),
    new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0.0, 1.0, 0.0), new THREE.Vector3(0.0, 0.0, 0.0)),
    new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0.0, -1.0, 0.0), new THREE.Vector3(0.0, 1.0, 0.0)),
    new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0.0, 0.0, 1.0), new THREE.Vector3(0.0, 0.0, -0.5)),
    new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0.0, 0.0, -1.0), new THREE.Vector3(0.0, 0.0, 0.5)),
  ];
  const clippingPlanes = clipTemplatePlanes.map((plane) => plane.clone());
  applyClippingPlanesToObject(banana, clippingPlanes);
  createRenderEffect(
    () => props.time,
    () => {
      if (slotGroup === undefined) {
        return;
      }
      slotGroup.updateWorldMatrix(true, false);
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(slotGroup.matrixWorld);
      for (let i = 0; i < clippingPlanes.length; ++i) {
        clippingPlanes[i].copy(clipTemplatePlanes[i]).applyMatrix4(slotGroup.matrixWorld, normalMatrix);
      }
      for (const group of clippedSymbolGroups) {
        applyClippingPlanesToObject(group, clippingPlanes);
      }
    },
  );
  onCleanup(() => geometry.dispose());
  return (
    <T.Group
      ref={(group) => {
        slotGroup = group;
      }}
    >
      <T.Mesh
        position={[ 0.0, 0.5, 0.0, ]}
        geometry={geometry}
      >
        <T.MeshStandardMaterial
          side={THREE.DoubleSide}
          color="gray"
        />
      </T.Mesh>
      <For each={[ 0, 1, 2, ].reverse()} keyed={false}>
        {(item, idx) => {
          let yPos2 = createMemo(() => yPos() + idx() * -1.0);
          let yPos3 = () => (yPos2() % 3) - 0.5;
          let visible = createMemo(() => {
            let yPos4 = yPos3();
            return -0.5 <= yPos4 && yPos4 <= 1.5;
          });
          return (
            <T.Group>
              {/*
              <T.Mesh
                ref={(self) => {
                  clippedSymbolGroups[item() + 3] = self;
                }}
                scale={0.85} position={[ 0, yPos3(), 0, ]}
                visible={visible()}
              >
                <T.BoxGeometry/>
                <T.MeshStandardMaterial
                  color="black"
                  transparent={true}
                  opacity={0.4}
                />
              </T.Mesh>
              */}
              <Switch>
                <Match when={item() == 0}>
                  <T.Group
                    ref={(group) => {
                      clippedSymbolGroups[item()] = group;
                    }}
                    position={[ -0.1, yPos3() - 0.1, 0.0, ]}
                    visible={visible()}
                  >
                    <Bomb
                      time={props.time}
                    />
                  </T.Group>
                </Match>
                <Match when={item() == 1}>
                  <T.Group
                    ref={(group) => {
                      clippedSymbolGroups[item()] = group;
                    }}
                    position={[ 0.0, yPos3() - 0.25, 0.0 ]}
                    scale={0.4}
                    visible={visible()}
                    renderOrder={-1}
                  >
                    <Lightning
                      clipped={true}
                      time={props.time}
                    />
                  </T.Group>
                </Match>
                <Match when={item() == 2}>
                  <T.Group
                    ref={(group) => {
                      clippedSymbolGroups[item()] = group;
                    }}
                    position={[ 0.0, yPos3() - 0.15, 0.0 ]}
                    scale={3.0}
                    visible={visible()}
                    renderOrder={-1}
                  >
                    <Entity
                      from={banana}
                    />
                  </T.Group>
                </Match>
              </Switch>
            </T.Group>
          );
        }}
      </For>
    </T.Group>
  );
};

export default SlotMachine;
