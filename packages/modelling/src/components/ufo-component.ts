import { ECS } from "@oasys/oecs";
import { ComponentDefGetDataType } from "./util";

export function mkUfoComponent(ecs: ECS) {
  return ecs.register_component({
    /**
     * The target entity the UFO will pick up.
     */
    target: "i32"
  });
}

export type UfoState = ComponentDefGetDataType<ReturnType<typeof mkUfoComponent>>;
