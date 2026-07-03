import { ECS } from "@oasys/oecs";
import { ComponentDefGetDataType } from "./util";

export function mkLastAngularVelocityComponent(ecs: ECS) {
  return ecs.registerComponent({
    x: "f32",
    y: "f32",
    z: "f32",
  });
}

export type LastAngularVelocityState = ComponentDefGetDataType<ReturnType<typeof mkLastAngularVelocityComponent>>;
