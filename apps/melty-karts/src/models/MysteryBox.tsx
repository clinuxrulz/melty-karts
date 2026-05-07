import { Component, onCleanup, onSettled, Show } from "solid-js";
import * as THREE from "three";
import { T } from "../t";

const questionMarkMaterial = (() => {
  let canvas = new OffscreenCanvas(128, 128);
  let ctx = canvas.getContext("2d");
  if (ctx === null) {
    return undefined;
  }
  ctx.font = "bold 100px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#888";
  ctx.fillText("?", 64, 64);
  let texture = new THREE.CanvasTexture(canvas);
  return new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
})();

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
  const position = geometry.attributes.position;
  const count = position.count;
  const colours: number[] = [];
  const brightColours = [
    new THREE.Color("#ff0000"),
    new THREE.Color("#00ff00"),
    new THREE.Color("#0000ff"),
    new THREE.Color("#ff00ff"),
    new THREE.Color("#ff7f00"),
    new THREE.Color("#ff007f"),
  ];
  for (let i = 0; i < count; i++) {
    let x = position.getX(i);
    let y = position.getY(i);
    let z = position.getZ(i);
    let xZero = Math.abs(x) < 0.001;
    let yZero = Math.abs(y) < 0.001;
    let zZero = Math.abs(z) < 0.001;
    if (xZero && zZero) {
      if (y > 0.0) {
        const colour = brightColours[0];
        colours.push(colour.r, colour.g, colour.b);
      } else {
        const colour = brightColours[2];
        colours.push(colour.r, colour.g, colour.b);
      }
    } else if (yZero && zZero) {
      if (x > 0.0) {
        const colour = brightColours[1];
        colours.push(colour.r, colour.g, colour.b);
      } else {
        const colour = brightColours[3];
        colours.push(colour.r, colour.g, colour.b);
      }
    } else {
      if (z > 0.0) {
        const colour = brightColours[4];
        colours.push(colour.r, colour.g, colour.b);
      } else {
        const colour = brightColours[5];
        colours.push(colour.r, colour.g, colour.b);
      }
    }
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.3,
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
        renderOrder={1}
      />
      <Show when={questionMarkMaterial}>
        {(questionMarkMaterial) => (
          <T.Sprite
            position={[ 0, 0.9, 0.0, ]}
            material={questionMarkMaterial()}
          />
        )}
      </Show>
    </T.Group>
  );
};

export default MysteryBox;
