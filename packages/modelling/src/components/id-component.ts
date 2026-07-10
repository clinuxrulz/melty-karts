import { ECS, EntityID } from "@oasys/oecs";
import type { ComponentRegistry } from "./registry";
import { IdGenResource } from "./id-gen-resource";
import { ReactiveECS } from "@melty-karts/reactive-ecs";

export function mkId(ecs: ECS) {
  return ecs.registerComponent({
    id: "i32",
  });
}

export function getOrCreateId(registry: ComponentRegistry, ecs: ReactiveECS, entityId: EntityID): number {
  if (ecs.ecs.hasComponent(entityId, registry.Id)) {
    return ecs.ecs.getField(entityId, registry.Id, "id");
  }
  let idGen = ecs.ecs.resources.get(IdGenResource);
  let id = idGen.nextId++;
  ecs.addComponent(entityId, registry.Id, { "id": id, });
  return id;
}
