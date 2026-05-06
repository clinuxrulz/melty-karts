import { Component, onCleanup, onSettled } from "solid-js";
import * as THREE from "three";
import { T } from "../t";

const MysteryBox: Component<{
  onHMR?: () => void,
}> = (props) => {
  if (props.onHMR !== undefined) {
    let onHMR = props.onHMR;
    onSettled(() => {
      onHMR();
    });
  }
  const geometry = new THREE.OctahedronGeometry(1, 0);
  const count = geometry.attributes.position.count;
  const colors = [];
  const brightColors = [
    new THREE.Color(0xff0000),
    new THREE.Color(0x00ff00),
    new THREE.Color(0x0000ff),
  ];
  for (let i = 0; i < count; i++) {
    let j = i;
    if (i >= 3 && i < 6) {
      j = 7 - j;
    } else if (i >= 6 && i < 9) {
      j = i;
    } else if (i >= 9 && i < 12) {
      j = 13 - i;
    } else if (i >= 12 && i < 15) {
      j = i;
    } else if (i >= 15 && i < 18) {
      j = 19 - i;
    } else if (i >= 18 && i < 21) {
      j = i;
    } else if (i >= 21 && i < 24) {
      j = 25 - i;
    }
    const color = brightColors[j % brightColors.length];
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
  });
  onCleanup(() => {
    geometry.dispose();
    material.dispose();
  });
  return (
    <T.Group>
      <T.Mesh
        position={[ 0, 1, 0, ]}
        geometry={geometry}
        material={material}
        scale={[ 0.85, 1.0, 0.85, ]}
      />
    </T.Group>
  );
};

export default MysteryBox;
