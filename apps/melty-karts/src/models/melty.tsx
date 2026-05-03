import { onCleanup, Component } from "solid-js";
import * as THREE from "three";
import { T } from "../t";

export function createMelty(): THREE.Object3D {
  return (<Melty/>) as unknown as THREE.Object3D;
}

export const Melty: Component = (props) => {
  let redMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  let yellowMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00 });
  onCleanup(() => {
    redMaterial.dispose();
    yellowMaterial.dispose();
  });
  let toothGeometry = new THREE.BoxGeometry(0.1, 0.2, 0.1);
  onCleanup(() => {
    toothGeometry.dispose();
  });
  let SideTooth = (props: { position: [ number, number, number, ], }) => (
    <T.Mesh
      geometry={toothGeometry}
      material={yellowMaterial}
      position={props.position}
    />
  );
  const eyeGeometry = new THREE.SphereGeometry(0.08);
  onCleanup(() => eyeGeometry.dispose());
  return (
    <T.Group>
      {/* Chin */}
      <T.Mesh
        position={[ 0.0, 0.1, 0.0, ]}
        material={redMaterial}
      >
        <T.BoxGeometry
          args={[ 0.5, 0.2, 0.5, ]}
        />
      </T.Mesh>
      {/* Head */}
      <T.Mesh
        position={[ 0.0, 0.45, 0.0, ]}
        material={redMaterial}
      >
        <T.BoxGeometry
          args={[ 0.5, 0.25, 0.5, ]}
        />
      </T.Mesh>
      {/* Left Tooth */}
      <SideTooth
        position={[ -0.14, 0.3, 0.3, ]}
      />
      {/* Right Tooth */}
      <SideTooth
        position={[ 0.14, 0.3, 0.3, ]}
      />
      {/* Middle Tooth */}
      <T.Mesh
        material={yellowMaterial}
        position={[ 0.0, 0.3, 0.3, ]}
      >
        <T.BoxGeometry
          args={[ 0.1, 0.4, 0.1, ]}
        />
      </T.Mesh>
      {/* Left Eye */}
      <T.Mesh
        geometry={eyeGeometry}
        material={yellowMaterial}
        position={[ -0.15, 0.48, 0.25, ]}
      />
      {/* Right Eye */}
      <T.Mesh
        geometry={eyeGeometry}
        material={yellowMaterial}
        position={[ 0.15, 0.48, 0.25, ]}
      />
    </T.Group>
  );
}

export default Melty;
