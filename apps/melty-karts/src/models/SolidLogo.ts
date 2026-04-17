import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";

export function createSolidLogo(): THREE.Object3D {
  let group = new THREE.Group();

  const material1 = new THREE.MeshStandardMaterial({
    color: 0x518ac8,
  });
  const material2 = new THREE.MeshStandardMaterial({
    color: 0x76b3e1,
  });

  const material3 = new THREE.MeshStandardMaterial({
    color: 0xffdd00,
  });
  const material4 = new THREE.MeshStandardMaterial({
    color: 0xffffff,
  });
  const material5 = new THREE.MeshStandardMaterial({
    color: 0x000000,
  });

  const depth = 50;

  const svgPath = 'm 135.55266,65.650453 a 45,45 0 0 0 -48.000001,-15 l -62,20 c 0,0 53,40.000007 94.000001,29.999997 l 3,-0.999997 c 17,-5 23,-21 13,-34 z';

  const loader = new SVGLoader();
  const svgData = loader.parse(`<svg><path d="${svgPath}"/></svg>`);
  const shapes = SVGLoader.createShapes(svgData.paths[0]);
  const teardropShape = shapes[0];

  const scale = 0.006;

  const geometry1 = new THREE.ExtrudeGeometry(teardropShape, {
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 3,
    depth: depth,
  });
  geometry1.center();

  const teardrop1 = new THREE.Mesh(geometry1, material1);
  teardrop1.position.set(-0.05, 0.16, 0);
  teardrop1.scale.set(scale, scale, scale);
  group.add(teardrop1);

  const geometry2 = new THREE.ExtrudeGeometry(teardropShape, {
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 3,
    depth: depth,
  });
  geometry2.center();

  const teardrop2 = new THREE.Mesh(geometry2, material2);
  teardrop2.position.set(0.05, -0.16, 0);
  teardrop2.rotation.z = Math.PI;
  teardrop2.scale.set(scale, scale, scale);
  group.add(teardrop2);

  const triangleShape = new THREE.Shape();
  triangleShape.moveTo(5, 0);
  triangleShape.lineTo(-4, 6);
  triangleShape.lineTo(-4, -3);
  triangleShape.closePath();

  const extrudeDepth = depth + 0.8;
  const geometry3 = new THREE.ExtrudeGeometry(triangleShape, {
    bevelEnabled: false,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 3,
    depth: extrudeDepth,
  });
  geometry3.center();

  group.rotation.x = Math.PI;

  let group2 = new THREE.Group();
  group2.add(group);
  let eyeGeometry = new THREE.SphereGeometry(0.1);
  let eye = new THREE.Mesh(eyeGeometry, material4);
  eye.position.set(0.0, 0.16, 0.5*depth*scale);
  group2.add(eye);
  let eyeDotGeometry = new THREE.SphereGeometry(0.03);
  let eyeDot = new THREE.Mesh(eyeDotGeometry, material5);
  eyeDot.position.copy(eye.position);
  eyeDot.position.z += 0.1;
  group2.add(eyeDot);
  let eye2 = eye.clone();
  eye2.position.z = -eye2.position.z;
  group2.add(eye2);
  let eyeDot2 = eyeDot.clone();
  eyeDot2.position.z = -eyeDot2.position.z;
  group2.add(eyeDot2);

  let legGroup = new THREE.Group();
  let legR = 0.03;
  let legGeometry = new THREE.CylinderGeometry(legR, legR, 0.3);
  let leg = new THREE.Mesh(legGeometry, material3);
  leg.position.set(
    0.0,
    -0.4,
    0.0,
  );
  let footShape = new THREE.Shape();
  footShape.moveTo(-0.14, 0.0);
  footShape.lineTo(0.2, 0.08);
  footShape.lineTo(0.2, -0.08);
  footShape.closePath();
  let footGeometry = new THREE.ExtrudeGeometry(
    footShape,
    {
      bevelEnabled: false,
      depth: 0.04,
    },
  );
  let foot = new THREE.Mesh(footGeometry, material3);
  foot.rotateX(0.5 * Math.PI);
  foot.position.set(
    0.0,
    -0.51,
    0.0,
  );
  legGroup.add(leg);
  legGroup.add(foot);
  legGroup.position.set(0, 0.0, 0.1);
  group2.add(legGroup);
  let legGroup2 = legGroup.clone();
  legGroup2.position.z = -legGroup2.position.z;
  group2.add(legGroup2);

  const triangle1 = new THREE.Mesh(geometry3, material3);
  triangle1.position.set(0.375, 0.14, 0);
  triangle1.scale.set(scale, scale, scale);
  group2.add(triangle1);

  let group3 = new THREE.Group();
  group2.rotateY(-0.5 * Math.PI);
  group2.position.set(
    0.0,
    0.55,
    0.0,
  );
  group3.add(group2);

  return group3;
}
