import { onCleanup } from "solid-js";
import * as THREE from "three";

export function createMelty(): THREE.Object3D {
  let group = new THREE.Group();
  let chinMesh: THREE.Mesh;
  let headMesh: THREE.Mesh;
  let outsideTeethMesh: THREE.Mesh[] = [];
  let middleToothMesh: THREE.Mesh;
  let eyesMesh: THREE.Mesh[] = [];

  const redMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  const yellowMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00 });

  onCleanup(() => {
    redMaterial.dispose();
    yellowMaterial.dispose();
  });

  const chinGeometry = new THREE.BoxGeometry(0.5, 0.2, 0.5);
  onCleanup(() => chinGeometry.dispose());

  chinMesh = new THREE.Mesh(chinGeometry, redMaterial);
  chinMesh.position.set(0.0, 0.1, 0.0);

  const headGeometry = new THREE.BoxGeometry(0.5, 0.25, 0.5);
  onCleanup(() => headGeometry.dispose());

  headMesh = new THREE.Mesh(headGeometry, redMaterial);
  headMesh.position.set(0.0, 0.45, 0.0);

  const toothGeometry = new THREE.BoxGeometry(0.1, 0.2, 0.1);
  onCleanup(() => toothGeometry.dispose());

  const leftTooth = new THREE.Mesh(toothGeometry, yellowMaterial);
  const rightTooth = new THREE.Mesh(toothGeometry, yellowMaterial);
  leftTooth.position.set(-0.14, 0.3, 0.3);
  rightTooth.position.set(0.14, 0.3, 0.3);
  outsideTeethMesh = [leftTooth, rightTooth];

  const middleToothGeometry = new THREE.BoxGeometry(0.1, 0.4, 0.1);
  onCleanup(() => middleToothGeometry.dispose());

  middleToothMesh = new THREE.Mesh(middleToothGeometry, yellowMaterial);
  middleToothMesh.position.set(0.0, 0.3, 0.3);

  const eyeGeometry = new THREE.SphereGeometry(0.08);
  onCleanup(() => eyeGeometry.dispose());

  const leftEyeMesh = new THREE.Mesh(eyeGeometry, yellowMaterial);
  const rightEyeMesh = new THREE.Mesh(eyeGeometry, yellowMaterial);
  leftEyeMesh.position.set(-0.15, 0.48, 0.25);
  rightEyeMesh.position.set(0.15, 0.48, 0.25);
  eyesMesh = [leftEyeMesh, rightEyeMesh];

  group.add(chinMesh);
  group.add(headMesh);
  outsideTeethMesh.forEach((m) => group.add(m));
  group.add(middleToothMesh);
  eyesMesh.forEach((m) => group.add(m));

  return group;
}
