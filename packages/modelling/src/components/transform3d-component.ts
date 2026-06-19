import { ECS } from "@oasys/oecs";
import * as THREE from "three";
import { ComponentDefGetDataType } from "./util";

export function mkTransform3DComponent(ecs: ECS) {
  return ecs.register_component({
    ox: "f32",
    oy: "f32",
    oz: "f32",
    qx: "f32",
    qy: "f32",
    qz: "f32",
    qw: "f32",
  });
}

export type TransformState = ComponentDefGetDataType<ReturnType<typeof mkTransform3DComponent>>;

const tmpVector3_1 = new THREE.Vector3();
const tmpQuaternion_1 = new THREE.Quaternion();

export function transformGetMatrix(transform: TransformState, out: THREE.Matrix4): THREE.Matrix4 {
  tmpQuaternion_1.set(
    transform.qx,
    transform.qy,
    transform.qz,
    transform.qw,
  );
  out.makeRotationFromQuaternion(tmpQuaternion_1);
  out.setPosition(
    transform.ox,
    transform.oy,
    transform.oz,
  );
  return out;
}

export function transformPointFromSpace(transform: TransformState, pt: THREE.Vector3): THREE.Vector3 {
  tmpVector3_1.set(
    transform.ox,
    transform.oy,
    transform.oz,
  );
  tmpQuaternion_1.set(
    transform.qx,
    transform.qy,
    transform.qz,
    transform.qw,
  );
  pt.applyQuaternion(tmpQuaternion_1);
  return pt.add(tmpVector3_1);
}

export function transformPointToSpace(transform: TransformState, pt: THREE.Vector3): THREE.Vector3 {
  tmpVector3_1.set(
    transform.ox,
    transform.oy,
    transform.oz,
  );
  tmpQuaternion_1.set(
    transform.qx,
    transform.qy,
    transform.qz,
    transform.qw,
  );
  tmpQuaternion_1.conjugate();
  pt.sub(tmpVector3_1);
  return pt.applyQuaternion(tmpQuaternion_1);
}
