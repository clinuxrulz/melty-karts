import { Component, createMemo, For, Match, onCleanup, Switch } from "solid-js";
import { T } from "../t";
import Bomb from "./Bomb";
import Lightning from "./Lightning";
import { createBanana } from "./banana";
import { Entity } from "solid-three";
import * as THREE from "three";

const SlotMachine: Component<{
  time: number,
}> = (props) => {
  let banana = createBanana();
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
  onCleanup(() => geometry.dispose());
  return (
    <T.Group>
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
              <T.Mesh
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
              <Switch>
                <Match when={item() == 0}>
                  <T.Group
                    position={[ 0.0, yPos3(), 0.0, ]}
                    visible={visible()}
                  >
                    <Bomb
                      time={props.time}
                    />
                  </T.Group>
                </Match>
                <Match when={item() == 1}>
                  <T.Group
                    position={[ 0.0, yPos3() - 0.25, 0.0 ]}
                    scale={0.4}
                    visible={visible()}
                    renderOrder={-1}
                  >
                    <Lightning
                      time={props.time}
                    />
                  </T.Group>
                </Match>
                <Match when={item() == 2}>
                  <T.Group
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
