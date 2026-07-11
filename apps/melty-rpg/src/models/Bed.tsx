import { onCleanup, type Component } from "solid-js";
import * as THREE from "three";
import { T } from "../t";
import { Fn, positionLocal, vec3 } from "three/src/nodes/TSL.js";
import { MeshStandardNodeMaterial } from "three/webgpu";

const Bed: Component = (props) => {
  let blanketColour = Fn(() => {
    let posX = positionLocal.x;
    let tmp = posX.mod(0.2);
    return tmp.lessThan(0.1)
      .select(
        vec3(1.0, 0.0, 0.0),
        vec3(1.0, 1.0, 0.0),
      );
  });
  let blanketMaterial = new MeshStandardNodeMaterial({
    colorNode: blanketColour(),
  });
  onCleanup(() => {
    blanketMaterial.dispose();
  });
  let frameProfileShape = new THREE.Shape();
  frameProfileShape.ellipse(
    0.0,
    0.0,
    0.03,
    0.03,
    0.0,
    2.0 * Math.PI,
  );
  let framePath = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0.0, -0.4, -0.48),
      new THREE.Vector3(0.0, 0.2, -0.48),
      new THREE.Vector3(0.0, 0.3, -0.38),
      new THREE.Vector3(0.0, 0.3, 0.38),
      new THREE.Vector3(0.0, 0.2, 0.48),
      new THREE.Vector3(0.0, -0.4, 0.48),
    ],
  );
  return (
    <T.Group>
      { /* matress */ }
      <T.Mesh>
        <T.BoxGeometry args={[ 1.88, 0.2, 0.92, ]}/>
        <T.MeshStandardMaterial color={"white"}/>
      </T.Mesh>
      { /* blanket */ }
      <T.Mesh
        position={[ 0.33, 0.05, 0.0, ]}
        material={blanketMaterial}
      >
        <T.BoxGeometry args={[ 1.25, 0.15, 0.95, ]}/>
        { /* <T.MeshStandardMaterial color={"yellow"}/> */ }
      </T.Mesh>
      { /* pillow */ }
      <T.Mesh position={[ -0.6, 0.17, 0.0, ]}>
        <T.BoxGeometry args={[ 0.48, 0.15, 0.73, ]}/>
        <T.MeshStandardMaterial color={"#3080FF"}/>
      </T.Mesh>
      { /* bed frame */ }
      <T.Mesh
        position={[ -0.9, 0.0, 0.0, ]}
      >
        <T.ExtrudeGeometry
          args={[
            frameProfileShape,
            {
              bevelEnabled: false,
              extrudePath: framePath,
              steps: 100,
            },
          ]}
        />
        <T.MeshStandardMaterial color={"lightgrey"}/>
      </T.Mesh>
      <T.Mesh
        position={[ 0.9, 0.0, 0.0, ]}
      >
        <T.ExtrudeGeometry
          args={[
            frameProfileShape,
            {
              bevelEnabled: false,
              extrudePath: framePath,
              steps: 100,
            },
          ]}
        />
        <T.MeshStandardMaterial color={"lightgrey"}/>
      </T.Mesh>
    </T.Group>
  );
};

export default Bed;

