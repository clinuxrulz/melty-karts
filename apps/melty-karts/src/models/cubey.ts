import { onCleanup } from "solid-js";
import * as THREE from "three";

export function createCubey(): THREE.Object3D {
  let group = new THREE.Group();
  let chinMesh: THREE.Mesh;
  let headMesh: THREE.Mesh;
  let outsideTeethMesh: THREE.Mesh[] = [];
  let middleToothMesh: THREE.Mesh;
  let eyesMesh: THREE.Mesh[] = [];

  const yellowMaterial = new THREE.MeshStandardMaterial({ color: "#ffff00", });
  const blueMaterial = new THREE.MeshStandardMaterial({ color: "#00bbff", });

  onCleanup(() => {
    yellowMaterial.dispose();
    blueMaterial.dispose();
  });

  const lenX = 0.5;
  const lenY = 0.5;
  const lenZ = 0.5;

  const eyeLenX = 0.1;
  const eyeLenY = 0.1;
  const eyeLenZ = 0.05;
  const leftEyeCentreX = -0.20 * lenX;
  const rightEyeCentreX = -leftEyeCentreX;
  const eyeCentreY = 0.25 * lenY;

  const mouthLenX = 0.7 * lenX;
  const mouthLenY = 0.1;
  const mouthCentreY = -0.2 * lenY;

  {
    let shape = new THREE.Shape();
    shape.moveTo(-0.5 * lenX, -0.5 * lenY);
    shape.lineTo(+0.5 * lenX, -0.5 * lenY);
    shape.lineTo(+0.5 * lenX, +0.5 * lenY);
    shape.lineTo(-0.5 * lenY, +0.5 * lenY);
    shape.closePath();
    // left eye
    {
      let eyeHolePath = new THREE.Path();
      eyeHolePath.moveTo(leftEyeCentreX - 0.5 * eyeLenX, eyeCentreY - 0.5 * eyeLenY);
      eyeHolePath.lineTo(leftEyeCentreX + 0.5 * eyeLenX, eyeCentreY - 0.5 * eyeLenY);
      eyeHolePath.lineTo(leftEyeCentreX + 0.5 * eyeLenX, eyeCentreY + 0.5 * eyeLenY);
      eyeHolePath.lineTo(leftEyeCentreX - 0.5 * eyeLenX, eyeCentreY + 0.5 * eyeLenY);
      eyeHolePath.closePath();
      shape.holes.push(eyeHolePath);
      //
      let geometry = new THREE.BoxGeometry(eyeLenX, eyeLenY, eyeLenZ * 0.1);
      onCleanup(() => geometry.dispose());
      let mesh = new THREE.Mesh(geometry, blueMaterial);
      mesh.position.set(
        leftEyeCentreX,
        0.5 * lenY + eyeCentreY,
        0.5 * lenZ - eyeLenZ + eyeLenZ * 0.1,
      );
      group.add(mesh);
    }
    // right eye
    {
      let eyeHolePath = new THREE.Path();
      eyeHolePath.moveTo(rightEyeCentreX - 0.5 * eyeLenX, eyeCentreY - 0.5 * eyeLenY);
      eyeHolePath.lineTo(rightEyeCentreX + 0.5 * eyeLenX, eyeCentreY - 0.5 * eyeLenY);
      eyeHolePath.lineTo(rightEyeCentreX + 0.5 * eyeLenX, eyeCentreY + 0.5 * eyeLenY);
      eyeHolePath.lineTo(rightEyeCentreX - 0.5 * eyeLenX, eyeCentreY + 0.5 * eyeLenY);
      eyeHolePath.closePath();
      shape.holes.push(eyeHolePath);
      //
      let geometry = new THREE.BoxGeometry(eyeLenX, eyeLenY, eyeLenZ * 0.1);
      onCleanup(() => geometry.dispose());
      let mesh = new THREE.Mesh(geometry, blueMaterial);
      mesh.position.set(
        rightEyeCentreX,
        0.5 * lenY + eyeCentreY,
        0.5 * lenZ - eyeLenZ + eyeLenZ * 0.1,
      );
      group.add(mesh);
    }
    // mouth
    {
      let mouthHolePath = new THREE.Path();
      mouthHolePath.moveTo(-0.5 * mouthLenX, mouthCentreY - 0.5 * mouthLenY);
      mouthHolePath.lineTo(+0.5 * mouthLenX, mouthCentreY - 0.5 * mouthLenY);
      mouthHolePath.lineTo(+0.5 * mouthLenX, mouthCentreY + 0.5 * mouthLenY);
      mouthHolePath.lineTo(-0.5 * mouthLenX, mouthCentreY + 0.5 * mouthLenY);
      mouthHolePath.closePath();
      shape.holes.push(mouthHolePath);
      //
      let geometry = new THREE.BoxGeometry(mouthLenX, eyeLenY, eyeLenZ * 0.1);
      onCleanup(() => geometry.dispose());
      let mesh = new THREE.Mesh(geometry, blueMaterial);
      mesh.position.set(
        0.0,
        0.5 * lenY + mouthCentreY,
        0.5 * lenZ - eyeLenZ + eyeLenZ * 0.1,
      );
      group.add(mesh);
    }
    //
    let faceGeometry = new THREE.ExtrudeGeometry(
      shape,
      {
        bevelEnabled: false,
        depth: eyeLenZ,
      },
    );
    onCleanup(() => faceGeometry.dispose());
    let mesh = new THREE.Mesh(faceGeometry, yellowMaterial);
    mesh.translateY(0.5 * lenY);
    mesh.translateZ(0.5 * lenZ - eyeLenZ);
    group.add(mesh);
  }

  // body
  {
    let geometry = new THREE.BoxGeometry(lenX, lenY, lenZ - eyeLenZ);
    onCleanup(() => geometry.dispose());
    let mesh = new THREE.Mesh(geometry, yellowMaterial);
    mesh.translateY(0.5 * lenY);
    mesh.translateZ(-0.5 * eyeLenZ);
    group.add(mesh);
  }

  /*
  const chinGeometry = new THREE.BoxGeometry(0.5, 0.2, 0.5);
  onCleanup(() => chinGeometry.dispose());

  chinMesh = new THREE.Mesh(chinGeometry, yellowMaterial);
  chinMesh.position.set(0.0, 0.1, 0.0);

  const headGeometry = new THREE.BoxGeometry(0.5, 0.25, 0.5);
  onCleanup(() => headGeometry.dispose());

  headMesh = new THREE.Mesh(headGeometry, yellowMaterial);
  headMesh.position.set(0.0, 0.45, 0.0);

  const toothGeometry = new THREE.BoxGeometry(0.1, 0.2, 0.1);
  onCleanup(() => toothGeometry.dispose());

  const leftTooth = new THREE.Mesh(toothGeometry, blueMaterial);
  const rightTooth = new THREE.Mesh(toothGeometry, blueMaterial);
  leftTooth.position.set(-0.14, 0.3, 0.3);
  rightTooth.position.set(0.14, 0.3, 0.3);
  outsideTeethMesh = [leftTooth, rightTooth];

  const middleToothGeometry = new THREE.BoxGeometry(0.1, 0.4, 0.1);
  onCleanup(() => middleToothGeometry.dispose());

  middleToothMesh = new THREE.Mesh(middleToothGeometry, blueMaterial);
  middleToothMesh.position.set(0.0, 0.3, 0.3);

  const eyeGeometry = new THREE.SphereGeometry(0.08);
  onCleanup(() => eyeGeometry.dispose());

  const leftEyeMesh = new THREE.Mesh(eyeGeometry, blueMaterial);
  const rightEyeMesh = new THREE.Mesh(eyeGeometry, blueMaterial);
  leftEyeMesh.position.set(-0.15, 0.48, 0.25);
  rightEyeMesh.position.set(0.15, 0.48, 0.25);
  eyesMesh = [leftEyeMesh, rightEyeMesh];

  group.add(chinMesh);
  group.add(headMesh);
  outsideTeethMesh.forEach((m) => group.add(m));
  group.add(middleToothMesh);
  eyesMesh.forEach((m) => group.add(m));
  */
  return group;
}
