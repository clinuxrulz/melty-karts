import { ComponentDef, ComponentSchema, ECS } from "@oasys/oecs";
import { mkTransform3DComponent } from "./transform3d-component";
import { mkId } from "./id-component";
import { mkParentComponent } from "./parent-component";
import { mkChildComponent } from "./child-component";
import { mkTrackComponent } from "./track-component";
import { mkTrackPathPtComponent } from "./track-path-pt-component";
import { registerIdGenResource } from "./id-gen-resource";
import { mkLoopDaLoopComponent } from "./loop-da-loop-component";
import { mkVelocityComponent } from "./velocity-component";
import { mkAngularVelocityComponent } from "./angular-velocity-component";
import { mkUfoComponent } from "./ufo-component";
import { mkLastAngularVelocityComponent } from "./last-angular-velocity-component";
import { mkLastVelocityComponent } from "./last-velocity-component";
import { mkStillTimeComponent } from "./still-time-component";
import { mkSpiralComponent } from "./spiral-component";
import { mkUfoTargetComponent } from "./ufo-target-component";
import { mkLastTransform3DComponent } from "./last-transform-3d-component";
import { mkCoyoteTimeComponent } from "./coyote-time-component";
import { mkCurrentSteeringComponent } from "./current-steering-component";
import { mkModelComponent } from "./model-component";

export function registerComponents(ecs: ECS) {
  registerIdGenResource(ecs);
  let componentTypeToSchemaMap = new Map<ComponentDef, ComponentSchema>();
  function registerComponent<S extends ComponentSchema>(schema: S): ComponentDef<S> {
    let componentDef = ecs.registerComponent(schema);
    componentTypeToSchemaMap.set(
      componentDef as ComponentDef,
      schema,
    );
    return componentDef;
  }
  let proxiedEcs = new Proxy(
    ecs,
    {
      get(target, p, receiver) {
        if (p === "registerComponent") {
          return registerComponent;
        } else {
          return Reflect.get(target, p, receiver);
        }
      },
    },
  );
  //
  return {
    componentTypeToSchemaMap,
    AngularVelocity: mkAngularVelocityComponent(proxiedEcs),
    Child: mkChildComponent(proxiedEcs),
    CoyoteTime: mkCoyoteTimeComponent(proxiedEcs),
    CurrentSteering: mkCurrentSteeringComponent(proxiedEcs),
    Id: mkId(proxiedEcs),
    LastAngularVelocity: mkLastAngularVelocityComponent(proxiedEcs),
    LastTransform3D: mkLastTransform3DComponent(proxiedEcs),
    LastVelocity: mkLastVelocityComponent(proxiedEcs),
    LoopDaLoop: mkLoopDaLoopComponent(proxiedEcs),
    Model: mkModelComponent(proxiedEcs),
    Parent: mkParentComponent(proxiedEcs),
    Spiral: mkSpiralComponent(proxiedEcs),
    StillTime: mkStillTimeComponent(proxiedEcs),
    Track: mkTrackComponent(proxiedEcs),
    TrackPathPt: mkTrackPathPtComponent(proxiedEcs),
    Transform3D: mkTransform3DComponent(proxiedEcs),
    Ufo: mkUfoComponent(proxiedEcs),
    UfoTarget: mkUfoTargetComponent(proxiedEcs),
    Velocity: mkVelocityComponent(proxiedEcs),
  };
}

export type ComponentRegistry = ReturnType<typeof registerComponents>;
