import { ECS } from "@oasys/oecs";
import { ComponentDefGetDataType } from "./util";

export function mkLastTransform3DComponent(ecs: ECS) {
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

export type LastTransform3DState = ComponentDefGetDataType<ReturnType<typeof mkLastTransform3DComponent>>;
