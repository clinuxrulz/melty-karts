import { ECS } from "@oasys/oecs";
import { ComponentDefGetDataType } from "./util";

export function mkUfoTargetComponent(ecs: ECS) {
  return ecs.registerComponent({
    ufo: "i32",
  });
}

export type UfoTargetState = ComponentDefGetDataType<ReturnType<typeof mkUfoTargetComponent>>;
