import { ECS } from "@oasys/oecs";
import { ComponentDefGetDataType } from "./util";

export function mkCurrentSteeringComponent(ecs: ECS) {
  return ecs.registerComponent({
    steering: "f32",
  });
}

export type CurrentSteeringState = ComponentDefGetDataType<ReturnType<typeof mkCurrentSteeringComponent>>;
