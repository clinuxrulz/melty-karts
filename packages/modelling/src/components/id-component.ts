import { ECS, EntityID } from "@oasys/oecs";
import type { ComponentRegistry } from "./registry";
import { IdGenResource } from "./id-gen-resource";
import { ReactiveECS } from "@melty-karts/reactive-ecs";

export function mkId(ecs: ECS) {
  return ecs.register_component({
    id: "i32",
  });
}

export function getOrCreateId(registry: ComponentRegistry, ecs: ReactiveECS, entityId: EntityID): number {
  if (ecs.ecs.has_component(entityId, registry.Id)) {
    return ecs.ecs.get_field(entityId, registry.Id, "id");
  }
  let idGen = ecs.ecs.resource(IdGenResource);
  let id = idGen.nextId++;
  ecs.add_component(entityId, registry.Id, { "id": id, });
  return id;
}
