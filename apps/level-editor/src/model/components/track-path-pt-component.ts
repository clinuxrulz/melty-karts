import { ECS } from "@oasys/oecs";
import { ComponentDefGetDataType } from "./util";

export function mkTrachPathPtComponent(ecs: ECS) {
  return ecs.register_component({
    px: "f32",
    py: "f32",
    pz: "f32",
    /** twist angle in radians */
    twist: "f32",
  });
}

export type TrackState = ComponentDefGetDataType<ReturnType<typeof mkTrachPathPtComponent>>;
