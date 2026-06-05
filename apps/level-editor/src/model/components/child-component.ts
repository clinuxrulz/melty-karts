import { ECS } from "@oasys/oecs";
import { ComponentDefGetDataType } from "./util";

export function mkChildComponent(ecs: ECS) {
  return ecs.register_component({
    parent: "i32",
    prev: "i32",
    next: "i32",
  });
}

export type ChildState = ComponentDefGetDataType<ReturnType<typeof mkChildComponent>>;
