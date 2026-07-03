import { ECS } from "@oasys/oecs";
import { ComponentDefGetDataType, ComponentDefGetSchemaType } from "./util";

/**
 * Track component, the path of the track is managed by its children which
 * each have a TrackPathPt component.
 * @param ecs 
 * @returns 
 */
export function mkTrackComponent(ecs: ECS) {
  return ecs.registerComponent({
    width: "f32",
  });
}

export type TrackSchema = ComponentDefGetSchemaType<ReturnType<typeof mkTrackComponent>>;
export type TrackState = ComponentDefGetDataType<ReturnType<typeof mkTrackComponent>>;
