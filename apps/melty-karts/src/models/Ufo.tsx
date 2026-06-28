import { Component, onCleanup } from "solid-js";
import * as THREE from "three";
import * as CSG from "three-bvh-csg";
import { T } from "../t";
import { MeshPhysicalNodeMaterial, MeshStandardNodeMaterial } from "three/webgpu";
import { color, float, oscSine, time } from "three/tsl";

const csgEvaluator = new CSG.Evaluator();

const Ufo: Component<{}> = (props) => {
  const glassMaterialNode = new MeshPhysicalNodeMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0.1,
    transmission: 0.9,//1.0, 
    thickness: 2.0,
    ior: 1.08,//1.5,
  });
  //glassMaterialNode.roughnessNode = oscSine(time.mul(0.5)).mul(0.3); 
  onCleanup(() => glassMaterialNode.dispose());
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
  onCleanup(() => metalMaterial.dispose());
  metalMaterial.colorNode = color("#AAAAAA");
  metalMaterial.roughnessNode = float(0.5);
  metalMaterial.metalnessNode = float(0.6);
  const metalMaterial2 = new MeshStandardNodeMaterial();
  onCleanup(() => metalMaterial2.dispose());
  metalMaterial2.colorNode = color("#CCCCCC");
  metalMaterial2.roughnessNode = float(0.5);
  metalMaterial2.metalnessNode = float(0.6);
  let spriteTexture = new THREE.TextureLoader().load("./pilots.webp");
  return (
    <T.Group position={[ 0.0, 1.0, 0.0 ]}>
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
      </T.Group>
    </T.Group>
  );
};

export default Ufo;
