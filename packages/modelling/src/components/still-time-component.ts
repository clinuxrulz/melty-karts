import { ECS } from "@oasys/oecs";
import { ComponentDefGetDataType } from "./util";

export function mkStillTimeComponent(ecs: ECS) {
  return ecs.register_component({
    time: "f32",
  });
}

export type StillTimeState = ComponentDefGetDataType<ReturnType<typeof mkStillTimeComponent>>;
