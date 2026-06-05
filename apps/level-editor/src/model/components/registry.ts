import { ECS } from "@oasys/oecs";
import { mkTransform3DComponent } from "./transform3d-component";
import { mkId } from "./id-component";
import { mkParentComponent } from "./parent-component";
import { mkChildComponent } from "./child-component";
import { mkTrackComponent } from "./track-component";
import { mkTrachPathPtComponent } from "./track-path-pt-component";
import { registerIdGenResource } from "./id-gen-resource";

export function registerComponents(ecs: ECS) {
  registerIdGenResource(ecs);
  return {
    Child: mkChildComponent(ecs),
    Id: mkId(ecs),
    Parent: mkParentComponent(ecs),
    Track: mkTrackComponent(ecs),
    TrackPathPt: mkTrachPathPtComponent(ecs),
    Transform3D: mkTransform3DComponent(ecs),
  };
}

export type ComponentRegistry = ReturnType<typeof registerComponents>;
