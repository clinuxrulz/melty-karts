import { ECS, EntityID } from "@oasys/oecs";
import { ComponentDefGetDataType } from "./util";
import { ComponentRegistry } from "./registry";
import { ReactiveECS } from "@melty-karts/reactive-ecs";

export function mkParentComponent(ecs: ECS) {
  return ecs.register_component({
    head: "i32",
    tail: "i32",
    count: "i32",
  });
}

export type ParentState = ComponentDefGetDataType<ReturnType<typeof mkParentComponent>>;

export function entityAddChild(registry: ComponentRegistry, ecs: ReactiveECS, entityId: EntityID, childId: EntityID) {
  let head: EntityID | -1;
  let tail: EntityID | -1;
  let count: number;
  if (ecs.ecs.has_component(entityId, registry.Parent)) {
    head = ecs.ecs.get_field(entityId, registry.Parent, "head") as EntityID | -1;
    tail = ecs.ecs.get_field(entityId, registry.Parent, "tail") as EntityID | -1;
    count = ecs.ecs.get_field(entityId, registry.Parent, "count");
  } else {
    head = -1;
    tail = -1;
    count = 0;
  }
  ecs.add_component(
    childId,
    registry.Child,
    {
      "parent": entityId,
      "prev": tail,
      "next": -1,
    }
  );
  if (head === -1) {
    head = childId;
  } else {
    ecs.set_field(
      tail as EntityID,
      registry.Child,
      "next", 
      childId,
    );
  }
  tail = childId;
  ++count;
  if (ecs.ecs.has_component(entityId, registry.Parent)) {
    ecs.set_field(entityId, registry.Parent, "head", head);
    ecs.set_field(entityId, registry.Parent, "tail", tail);
    ecs.set_field(entityId, registry.Parent, "count", count);
  } else {
    ecs.add_component(
      entityId,
      registry.Parent,
      {
        head,
        tail,
        count,
      },
    );
  }
}
