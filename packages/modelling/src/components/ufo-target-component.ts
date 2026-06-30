import { ECS } from "@oasys/oecs";
import { ComponentDefGetDataType } from "./util";

export function mkUfoTargetComponent(ecs: ECS) {
  return ecs.register_component({
    ufo: "i32",
  });
}

export type UfoTargetState = ComponentDefGetDataType<ReturnType<typeof mkUfoTargetComponent>>;
