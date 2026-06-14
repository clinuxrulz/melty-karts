import { ComponentDef, ComponentSchema, ECS } from "@oasys/oecs";
import { mkTransform3DComponent } from "./transform3d-component";
import { mkId } from "./id-component";
import { mkParentComponent } from "./parent-component";
import { mkChildComponent } from "./child-component";
import { mkTrackComponent } from "./track-component";
import { mkTrackPathPtComponent } from "./track-path-pt-component";
import { registerIdGenResource } from "./id-gen-resource";

export function registerComponents(ecs: ECS) {
  registerIdGenResource(ecs);
  let componentTypeToSchemaMap = new Map<ComponentDef<ComponentSchema>,ComponentSchema>();
  // schema grabber
  // <S extends Record<string, TypedArrayTag>>(schema: S): ComponentDef<S>
  function register_component<S extends ComponentSchema>(schema: S): ComponentDef<S> {
    let componentDef = ecs.register_component(schema);
    componentTypeToSchemaMap.set(
      componentDef,
      schema,
    );
    return componentDef;
  }
  let proxiedEcs = new Proxy(
    ecs,
    {
      get(target, p, receiver) {
        if (p === "register_component") {
          return register_component;
        } else {
          return Reflect.get(target, p, receiver);
        }
      },
    },
  );
  //
  return {
    componentTypeToSchemaMap,
    Child: mkChildComponent(proxiedEcs),
    Id: mkId(proxiedEcs),
    Parent: mkParentComponent(proxiedEcs),
    Track: mkTrackComponent(proxiedEcs),
    TrackPathPt: mkTrackPathPtComponent(proxiedEcs),
    Transform3D: mkTransform3DComponent(proxiedEcs),
  };
}

export type ComponentRegistry = ReturnType<typeof registerComponents>;
