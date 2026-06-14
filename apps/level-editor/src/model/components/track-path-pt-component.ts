import { ECS } from "@oasys/oecs";
import { ComponentDefGetDataType, ComponentDefGetSchemaType } from "./util";

export function mkTrackPathPtComponent(ecs: ECS) {
  return ecs.register_component({
    px: "f32",
    py: "f32",
    pz: "f32",
    /** twist angle in radians */
    twist: "f32",
  });
}

export type TrackPathPtSchema = ComponentDefGetSchemaType<ReturnType<typeof mkTrackPathPtComponent>>;
export type TrackPathPtState = ComponentDefGetDataType<ReturnType<typeof mkTrackPathPtComponent>>;
