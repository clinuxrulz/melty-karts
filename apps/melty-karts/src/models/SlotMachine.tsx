import { Component, createRenderEffect, createMemo, For, Match, Switch } from "solid-js";
import { T } from "../t";
import Bomb from "./Bomb";
import Lightning from "./Lightning";
import { createBanana } from "./banana";
import { Entity } from "solid-three";
import * as THREE from "three";
import { TSL } from "three/webgpu";
const { uniform, positionWorld, vec4, output, Fn, Discard } = TSL;

// Shared resources created once at module init
const _sharedClipGeometry = (() => {
  let geometry = new THREE.BoxGeometry().toNonIndexed();
  const posAttr = geometry.getAttribute("position");
  const filteredPositions = [];
  for (let i = 0; i < posAttr.count; i += 3) {
    if (!(posAttr.getZ(i) > -0.4 && posAttr.getZ(i + 1) > -0.4 && posAttr.getZ(i + 2) > -0.4)) {
      for (let j = 0; j < 3; j++) {
        filteredPositions.push(posAttr.getX(i+j), posAttr.getY(i+j), posAttr.getZ(i+j));
      }
    }
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(filteredPositions, 3));
  geometry.computeVertexNormals();
  return geometry;
})();

const _sharedSlotInverseMatrix = uniform(new THREE.Matrix4());
const _sharedSlotClipResult = Fn(() => {
  const localPos = _sharedSlotInverseMatrix.mul(vec4(positionWorld, 1.0)).xyz;
  const outside = localPos.x.lessThan(-0.5)
    .or(localPos.x.greaterThan(0.5))
    .or(localPos.y.lessThan(0.0))
    .or(localPos.y.greaterThan(1.0))
    .or(localPos.z.lessThan(-0.5))
    .or(localPos.z.greaterThan(0.5));
  Discard(outside);
  return output;
})();

const SlotMachine: Component<{
  time: number,
  wheelRotation: number,
}> = (props) => {
  let bananas: THREE.Object3D[] = new Array(5);
  for (let i = 0; i < 5; ++i) {
    bananas[i] = createBanana();
  }
  let slotGroup: THREE.Group | undefined;
  const clippedSymbolGroups: Array<THREE.Object3D | undefined> = [];
  let yPos = createMemo(() => 6.0 - (props.wheelRotation * 2.0 % 5.0));
  let clipInitialized = false;

  // Apply clip to pre-existing banana materials immediately
  for (const bg of bananas) {
    bg.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of materials) {
            (m as any).outputNode = _sharedSlotClipResult;
            m.needsUpdate = true;
          }
        }
      }
    });
  }

  createRenderEffect(
    () => props.time,
    () => {
      if (slotGroup === undefined) return;

      // On first frame, apply clip to JSX-rendered materials (Bomb, Lightning)
      if (!clipInitialized) {
        slotGroup.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (mesh.material) {
              const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              for (const m of materials) {
                if (!(m as any).outputNode) {
                  (m as any).outputNode = _sharedSlotClipResult;
                  m.needsUpdate = true;
                }
              }
            }
          }
        });
        clipInitialized = true;
      }

      // Update inverse matrix every frame
      slotGroup.updateWorldMatrix(true, false);
      _sharedSlotInverseMatrix.value.copy(slotGroup.matrixWorld).invert();
    },
  );
  return (
    <T.Group
      ref={(group) => {
        slotGroup = group;
      }}
    >
      <T.Mesh
        position={[ 0.0, 0.5, 0.0, ]}
        geometry={_sharedClipGeometry}
      >
        <T.MeshStandardMaterial
          side={THREE.DoubleSide}
          color="gray"
        />
      </T.Mesh>
      <For each={[ 0, 1, 2, 3, 4, ].reverse()} keyed={false}>
        {(item, idx) => {
          let yPos2 = createMemo(() => yPos() + idx() * -1.0);
          let yPos3 = () => (yPos2() % 5) - 0.5;
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
                <Match when={item() === 1}>
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
                <Match when={item() === 2}>
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
                      from={bananas[0]}
                    />
                  </T.Group>
                </Match>
                <Match when={item() === 3}>
                  <T.Group
                    ref={(group) => {
                      clippedSymbolGroups[item()] = group;
                    }}
                    position={[ -0.1, yPos3() - 0.1, 0.0, ]}
                    scale={0.6}
                    visible={visible()}
                  >
                    <T.Group
                      position={[ -0.1, 0.0, -0.3, ]}
                      quaternion={new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)}
                    >
                      <Bomb
                        time={props.time}
                      />
                    </T.Group>
                    <T.Group
                      position={[ 0.0, 0.3, 0.3, ]}
                    >
                      <Bomb
                        time={props.time}
                      />
                    </T.Group>
                    <T.Group
                      position={[ 0.3, 0.0, 0.0, ]}
                    >
                      <Bomb
                        time={props.time}
                      />
                    </T.Group>
                  </T.Group>
                </Match>
                <Match when={item() === 4}>
                  <T.Group
                    ref={(group) => {
                      clippedSymbolGroups[item()] = group;
                    }}
                    position={[ -0.1, yPos3() - 0.1, 0.0, ]}
                    scale={2.0}
                    visible={visible()}
                  >
                    <T.Group
                      position={[ -0.1/2, 0.0-0.05, -0.3/2, ]}
                      quaternion={new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)}
                    >
                      <Entity from={bananas[1]}/>
                    </T.Group>
                    <T.Group
                      position={[ 0.0, 0.3/2-0.05, 0.3/2, ]}
                    >
                      <Entity from={bananas[2]}/>
                    </T.Group>
                    <T.Group
                      position={[ 0.3/2, 0.0, 0.0, ]}
                    >
                      <Entity from={bananas[3]}/>
                    </T.Group>
                    <T.Group
                      position={[ 0.3/2, -0.3/2, 0.0, ]}
                    >
                      <Entity from={bananas[4]}/>
                    </T.Group>
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
