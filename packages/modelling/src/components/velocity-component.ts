import { ECS } from "@oasys/oecs";
import { ComponentDefGetDataType } from "./util";

export function mkVelocityComponent(ecs: ECS) {
  return ecs.register_component({
    x: "f32",
    y: "f32",
    z: "f32",
  });
}

export type VelocityState = ComponentDefGetDataType<ReturnType<typeof mkVelocityComponent>>;
