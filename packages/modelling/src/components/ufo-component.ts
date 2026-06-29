import { ECS } from "@oasys/oecs";
import { ComponentDefGetDataType } from "./util";

export function mkUfoComponent(ecs: ECS) {
  return ecs.register_tag();
}

export type UfoState = ComponentDefGetDataType<ReturnType<typeof mkUfoComponent>>;
