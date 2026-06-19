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

export function entityAddChildBeforeChild(
  registry: ComponentRegistry, 
  ecs: ReactiveECS, 
  entityId: EntityID, 
  childId: EntityID, 
  beforeChildId: EntityID | -1
): void {
  if (beforeChildId === -1) {
    entityAddChild(registry, ecs, entityId, childId);
    return;
  }
  let head: EntityID | -1 = -1;
  let tail: EntityID | -1 = -1;
  let count: number = 0;
  if (ecs.ecs.has_component(entityId, registry.Parent)) {
    head = ecs.ecs.get_field(entityId, registry.Parent, "head") as EntityID | -1;
    tail = ecs.ecs.get_field(entityId, registry.Parent, "tail") as EntityID | -1;
    count = ecs.ecs.get_field(entityId, registry.Parent, "count");
  } else {
    entityAddChild(registry, ecs, entityId, childId);
    return;
  }
  const prevId = ecs.ecs.get_field(beforeChildId, registry.Child, "prev") as EntityID | -1;
  ecs.add_component(
    childId,
    registry.Child,
    {
      "parent": entityId,
      "prev": prevId,
      "next": beforeChildId,
    }
  );
  if (prevId === -1) {
    head = childId;
  } else {
    ecs.set_field(prevId, registry.Child, "next", childId);
  }
  ecs.set_field(beforeChildId, registry.Child, "prev", childId);
  ++count;
  ecs.set_field(entityId, registry.Parent, "head", head);
  ecs.set_field(entityId, registry.Parent, "tail", tail); // Tail stays the same when inserting before
  ecs.set_field(entityId, registry.Parent, "count", count);
}

export function entityRemoveChild(
  registry: ComponentRegistry, 
  ecs: ReactiveECS, 
  childId: EntityID
): void {
  if (!ecs.ecs.has_component(childId, registry.Child)) {
    return;
  }
  let parentId = ecs.ecs.get_field(
    childId,
    registry.Child,
    "parent",
  ) as EntityID;
  if (!ecs.ecs.has_component(parentId, registry.Parent)) {
    return;
  }
  let head = ecs.ecs.get_field(parentId, registry.Parent, "head") as EntityID | -1;
  let tail = ecs.ecs.get_field(parentId, registry.Parent, "tail") as EntityID | -1;
  let count = ecs.ecs.get_field(parentId, registry.Parent, "count") as number;
  const prevId = ecs.ecs.get_field(childId, registry.Child, "prev") as EntityID | -1;
  const nextId = ecs.ecs.get_field(childId, registry.Child, "next") as EntityID | -1;
  if (prevId === -1) {
    head = nextId;
  } else {
    ecs.set_field(prevId, registry.Child, "next", nextId);
  }
  if (nextId === -1) {
    tail = prevId;
  } else {
    ecs.set_field(nextId, registry.Child, "prev", prevId);
  }
  ecs.remove_component(childId, registry.Child);
  --count;
  if (count <= 0) {
    ecs.remove_component(parentId, registry.Parent);
  } else {
    ecs.set_field(parentId, registry.Parent, "head", head);
    ecs.set_field(parentId, registry.Parent, "tail", tail);
    ecs.set_field(parentId, registry.Parent, "count", count);
  }
}
