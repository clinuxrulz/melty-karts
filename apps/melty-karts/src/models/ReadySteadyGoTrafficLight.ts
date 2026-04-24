import { Accessor, createMemo, onCleanup, untrack } from "solid-js";
import * as THREE from "three";

export function createReadySteadyGoTrafficLight(
  lightOn: Accessor<"Red" | "Yellow" | "Green" | undefined>,
): THREE.Object3D {
  let group = new THREE.Group();
  const LEN_X = 0.425;
  const LEN_Y = 1.125;
  const LEN_Z = 0.2;
  const LIGHT_HAT_RADIUS = 0.5 * (LEN_X - 0.1);
  const LIGHT_HAT_THICKNESS = 0.02;
  const LIGHT_HAT_LENGTH = 0.15;
  const RED_LIGHT_DIST_DOWN_STEP = 0.2125;
  const YELLOW_LIGHT_DIST_DOWN_STEP = 0.35;
  const GREEN_LIGHT_DIST_DOWN_STEP = 0.35;
  const LIGHT_RADIUS = LIGHT_HAT_RADIUS - 0.01;
  let material = new THREE.MeshStandardMaterial({ color: "orange", });
  onCleanup(() => {
    material.dispose();
  });
  // Main traffic light body
  {
    let geometry = new THREE.BoxGeometry(
      LEN_X,
      LEN_Y,
      LEN_Z,
    );
    geometry.translate(
      0.0,
      0.5 * LEN_Y,
      0.0,
    );
    onCleanup(() => {
      geometry.dispose();
    });
    let mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
  }
  // Light hat
  {
    let shape = new THREE.Shape();
    shape.absellipse(
      0.0,
      0.0,
      LIGHT_HAT_RADIUS,
      LIGHT_HAT_RADIUS,
      0.0,
      2.0 * Math.PI,
    );
    let holePath = new THREE.Path();
    holePath.absellipse(
      0.0,
      0.0,
      LIGHT_HAT_RADIUS - LIGHT_HAT_THICKNESS,
      LIGHT_HAT_RADIUS - LIGHT_HAT_THICKNESS,
      0.0,
      2.0 * Math.PI,
    );
    shape.holes.push(holePath);
    let geometry: THREE.BufferGeometry = new THREE.ExtrudeGeometry(
      shape,
      {
        bevelEnabled: false,
        depth: LIGHT_HAT_LENGTH,
        curveSegments: 30
      },
    );
    // tweak the geometry shape the side profile of the light hat
    {
      let position = geometry.getAttribute("position");
      for (let i = 0; i < position.array.length / position.itemSize; ++i) {
        let x = position.getX(i);
        let y = position.getY(i);
        let z = position.getZ(i);
        let t = Math.atan2(y, z) / Math.PI;
        if (t > 0.3) {
          // no operation
        } else if (-0.3 <= t && t <= 0.3) {
          z *= (1.0 + 3.0 * (t - 0.3));
        } else {
          z *= 0.2;
        }
        position.setXYZ(i, x, y, z);
      }
    }
    geometry.computeVertexNormals();
    //
    onCleanup(() => {
      geometry.dispose();
    });
    let mesh = new THREE.InstancedMesh(geometry, material, 3);
    let position = new THREE.Vector3();
    let matrix = new THREE.Matrix4();
    let atY = LEN_Y - RED_LIGHT_DIST_DOWN_STEP;
    position.set(
      0.0,
      atY,
      0.5 * LEN_Z,
    );
    matrix.setPosition(position)
    mesh.setMatrixAt(
      0,
      matrix
    );
    atY -= YELLOW_LIGHT_DIST_DOWN_STEP;
    position.y = atY;
    matrix.setPosition(position)
    mesh.setMatrixAt(
      1,
      matrix
    );
    atY -= GREEN_LIGHT_DIST_DOWN_STEP;
    position.y = atY;
    matrix.setPosition(position)
    mesh.setMatrixAt(
      2,
      matrix
    );
    group.add(mesh);
  }
  // lights
  {
    let geometry = new THREE.SphereGeometry(LIGHT_RADIUS);
    {
      let position = geometry.getAttribute("position");
      for (let i = 0; i < position.array.length / position.itemSize; ++i) {
        position.setZ(i, position.getZ(i) * 0.2);
      }
    }
    onCleanup(() => {
      geometry.dispose();
    });

    // Helper to create a single light lens
    const createLightMesh = (colorHex: number, yPos: number, isOn: Accessor<boolean>) => {
      const baseColor = new THREE.Color(colorHex);
      const darkColor = baseColor.clone().multiplyScalar(0.2); // Darken the color when off

      let lightMat = new THREE.MeshStandardMaterial({
        roughness: 0.2,
        metalness: 0.1
      });

      createMemo(() => {
        if (isOn()) {
          lightMat.color = baseColor;
          lightMat.emissive = baseColor;
          lightMat.emissiveIntensity = 2.0;
        } else {
          lightMat.color = darkColor;
          lightMat.emissive = new THREE.Color(0x000000);
          lightMat.emissiveIntensity = 0.0;
        }
        lightMat.needsUpdate = true;
      });

      onCleanup(() => {
        lightMat.dispose();
      });

      let mesh = new THREE.Mesh(geometry, lightMat);
      mesh.position.set(0.0, yPos, 0.5 * LEN_Z);
      return mesh;
    };

    let atY = LEN_Y - RED_LIGHT_DIST_DOWN_STEP;
    group.add(createLightMesh(0xff0000, atY, createMemo(() => lightOn() === "Red")));

    atY -= YELLOW_LIGHT_DIST_DOWN_STEP;
    group.add(createLightMesh(0xffff00, atY, createMemo(() => lightOn() === "Yellow")));

    atY -= GREEN_LIGHT_DIST_DOWN_STEP;
    group.add(createLightMesh(0x00ff00, atY, createMemo(() => lightOn() === "Green")));
  }

  return group;
}
