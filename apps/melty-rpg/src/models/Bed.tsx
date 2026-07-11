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
  let pillowGeometry = new THREE.BoxGeometry(0.48, 0.15, 0.73, 20, 1, 40);
  {
    let points = pillowGeometry.getAttribute("position");
    for (let i = 0; i < points.count; ++i) {
      let px = points.getX(i);
      let py = points.getY(i);
      let pz = points.getZ(i);
      let dx = Math.abs(px) > 0.1 ? (Math.abs(px) - 0.1) / 0.14 : 0.0;
      let dz = Math.abs(pz) > 0.5*0.73-0.1 ? (Math.abs(pz) - (0.5*0.73-0.1)) / 0.1001 : 0.0;
      let t1 = Math.sqrt(1.0 - dx*dx);
      let t2 = Math.sqrt(1.0 - dz*dz);
      py *= t1 * t2;
      points.setY(i, py);
    }
    points.needsUpdate = true;
    pillowGeometry.computeVertexNormals();
  }
  onCleanup(() => {
    blanketMaterial.dispose();
    pillowGeometry.dispose();
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
    <T.Group position={[ 0.95, 0.4, 0.55, ]}>
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
      <T.Mesh
        position={[ -0.6, 0.17, 0.0, ]}
        geometry={pillowGeometry}
      >
        { /* <T.BoxGeometry args={[ 0.48, 0.15, 0.73, ]}/> */ }
        <T.MeshStandardMaterial color={"white"}/>
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

