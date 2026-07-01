import { Component, createRenderEffect, onCleanup, Show } from "solid-js";
import * as THREE from "three";
import * as CSG from "three-bvh-csg";
import { T } from "../t";
import { MeshBasicNodeMaterial, MeshNormalNodeMaterial, MeshPhysicalNodeMaterial, MeshStandardNodeMaterial } from "three/webgpu";
import { color, float, If, mix, oscSine, positionLocal, Return, time, uniform, uv, vec3, vec4 } from "three/tsl";
import { Fn } from "three/src/nodes/TSL.js";

const csgEvaluator = new CSG.Evaluator();

const glassMaterialNode = new MeshPhysicalNodeMaterial({
  color: 0xffffff,
  metalness: 0.0,
  roughness: 0.1,
  transmission: 0.9,//1.0, 
  thickness: 0.35,
  ior: 1.5,
});

let windowGeometry: THREE.BufferGeometry;
{
  let sphereBrush = new CSG.Brush(
    new THREE.SphereGeometry(1.0),
  );
  let innerSphereBrush = new CSG.Brush(
    new THREE.SphereGeometry(0.95),
  );
  let boxBrush = new CSG.Brush(
    new THREE.BoxGeometry(2, 2, 2),
  );
  boxBrush.position.set(0.0, -1.0, 0.0);
  boxBrush.updateMatrixWorld();
  let window = csgEvaluator.evaluate(
    csgEvaluator.evaluate(sphereBrush, innerSphereBrush, CSG.SUBTRACTION),
    boxBrush,
    CSG.SUBTRACTION,
  );
  windowGeometry = window.geometry;
}
let bodyGeometry: THREE.BufferGeometry;
{
  let shape = new THREE.Shape();
  shape.moveTo(0.0, 0.0);
  shape.bezierCurveTo(1, 0, 2, 0, 3.0, 0.5);
  shape.lineTo(0.0, 1.0);
  let bodyBrush = new CSG.Brush(
    new THREE.LatheGeometry(shape.getPoints(), 25, 0, 2.0 * Math.PI),
  );
  let cylinderBrush = new CSG.Brush(
    new THREE.CylinderGeometry(1, 1, 3)
  );
  cylinderBrush.updateMatrixWorld();
  let body = csgEvaluator.evaluate(
    bodyBrush,
    cylinderBrush,
    CSG.SUBTRACTION,
  );
  bodyGeometry = body.geometry;
}
const metalMaterial = new MeshStandardNodeMaterial();
metalMaterial.colorNode = color("#AAAAAA");
metalMaterial.roughnessNode = float(0.5);
metalMaterial.metalnessNode = float(0.6);
const metalMaterial2 = new MeshStandardNodeMaterial();
metalMaterial2.colorNode = color("#CCCCCC");
metalMaterial2.roughnessNode = float(0.5);
metalMaterial2.metalnessNode = float(0.6);
let spriteTexture = new THREE.TextureLoader().load("./pilots.webp");

const Ufo: Component<{
  position?: number | THREE.Vector3 | [x: number, y: number, z: number] | undefined,
  visible?: boolean,
  time?: number,
  showTractorBeam?: boolean,
}> = (props) => {
  let uTime = uniform(props.time ?? 0.0);
  let tratorBeamMaterial = new MeshBasicNodeMaterial();
  tratorBeamMaterial.transparent = true;
  let a = Fn(() => {
    let a2 =
      positionLocal.y
        .sub(
          uTime.mul(float(2.0))
            .add(uv().x.mul(float(30.0)).sin().mul(float(0.1).mul(uTime.mul(float(25)).sin().mul(float(1.0)))))
        )
        .mul(float(10.0))
        .sin()
        .add(float(1)).mul(float(0.5))
        .toVar();
    If(a2.lessThan(0.9), () => {
      a2.assign(float(0.0));
    });
    return a2;
  });
  tratorBeamMaterial.colorNode =
    mix(
      vec3(1.0, 0.0, 0.0),
      vec3(1.0, 1.0, 0.0),
      a(),
    );
  tratorBeamMaterial.opacityNode =
    (positionLocal.y.add(float(2.0))).mul(float(1.0 / 4.0)).mul(0.4); 
  createRenderEffect(
    () => props.time,
    (time) => {
      if (time === undefined) {
        return;
      }
      uTime.value = time;
    },
  );
  return (
    <T.Group
      position={props.position}
      visible={props.visible}
    >
      <T.Group
        position={[0.0, 0.25, 0.0]}
      >
        <T.Mesh
          geometry={windowGeometry}
          material={glassMaterialNode}
          renderOrder={2}
        />
        <T.Mesh
          geometry={bodyGeometry}
          position={[ 0.0, -0.7, 0.0, ]}
          material={metalMaterial}
        >
        </T.Mesh>
        <T.Mesh
          position={[ 0.0, -0.65, 0.0, ]}
          scale={[ 1.0, 0.2, 1.0, ]}
          material={metalMaterial2}
        >
          <T.SphereGeometry args={[1.0]}/>
        </T.Mesh>
        <T.Sprite
          position={[ 0, 0.32, 0, ]}
          scale={[ 1.5*0.7, 1.0*0.7, 1.0*0.7, ]}
          renderOrder={1}
        >
          <T.SpriteMaterial
            map={spriteTexture}
          />
        </T.Sprite>
        <Show when={props.showTractorBeam ?? false}>
          <T.Mesh
            position={[ 0.0, -2.5, 0.0, ]}
            material={tratorBeamMaterial}
            renderOrder={5}
          >
            <T.CylinderGeometry args={[ 0.5, 1.8, 4.0, ]}/>
          </T.Mesh>
        </Show>
      </T.Group>
    </T.Group>
  );
};

export default Ufo;
