import { ECS } from "@oasys/oecs";
import { ComponentDefGetDataType } from "./util";

export function mkLastVelocityComponent(ecs: ECS) {
  return ecs.register_component({
    x: "f32",
    y: "f32",
    z: "f32",
  });
}

export type LastVelocityState = ComponentDefGetDataType<ReturnType<typeof mkLastVelocityComponent>>;
