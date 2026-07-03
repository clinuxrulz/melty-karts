import { ECS } from "@oasys/oecs";
import { ComponentDefGetDataType } from "./util";

export function mkStillTimeComponent(ecs: ECS) {
  return ecs.registerComponent({
    time: "f32",
  });
}

export type StillTimeState = ComponentDefGetDataType<ReturnType<typeof mkStillTimeComponent>>;
