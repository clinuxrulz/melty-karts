import { ECS, EntityID } from "@oasys/oecs";
import { ComponentDefGetDataType } from "./util";
import { ComponentRegistry } from "./registry";
import { ReactiveECS } from "@melty-karts/reactive-ecs";

export function mkParentComponent(ecs: ECS) {
  return ecs.registerComponent({
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
  if (ecs.ecs.hasComponent(entityId, registry.Parent)) {
    head = ecs.ecs.getField(entityId, registry.Parent, "head") as EntityID | -1;
    tail = ecs.ecs.getField(entityId, registry.Parent, "tail") as EntityID | -1;
    count = ecs.ecs.getField(entityId, registry.Parent, "count");
  } else {
    head = -1;
    tail = -1;
    count = 0;
  }
  ecs.addComponent(
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
    ecs.setField(
      tail as EntityID,
      registry.Child,
      "next", 
      childId,
    );
  }
  tail = childId;
  ++count;
  if (ecs.ecs.hasComponent(entityId, registry.Parent)) {
    ecs.setField(entityId, registry.Parent, "head", head);
    ecs.setField(entityId, registry.Parent, "tail", tail);
    ecs.setField(entityId, registry.Parent, "count", count);
  } else {
    ecs.addComponent(
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
  if (ecs.ecs.hasComponent(entityId, registry.Parent)) {
    head = ecs.ecs.getField(entityId, registry.Parent, "head") as EntityID | -1;
    tail = ecs.ecs.getField(entityId, registry.Parent, "tail") as EntityID | -1;
    count = ecs.ecs.getField(entityId, registry.Parent, "count");
  } else {
    entityAddChild(registry, ecs, entityId, childId);
    return;
  }
  const prevId = ecs.ecs.getField(beforeChildId, registry.Child, "prev") as EntityID | -1;
  ecs.addComponent(
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
    ecs.setField(prevId, registry.Child, "next", childId);
  }
  ecs.setField(beforeChildId, registry.Child, "prev", childId);
  ++count;
  ecs.setField(entityId, registry.Parent, "head", head);
  ecs.setField(entityId, registry.Parent, "tail", tail); // Tail stays the same when inserting before
  ecs.setField(entityId, registry.Parent, "count", count);
}

export function entityRemoveChild(
  registry: ComponentRegistry, 
  ecs: ReactiveECS, 
  childId: EntityID
): void {
  if (!ecs.ecs.hasComponent(childId, registry.Child)) {
    return;
  }
  let parentId = ecs.ecs.getField(
    childId,
    registry.Child,
    "parent",
  ) as EntityID;
  if (!ecs.ecs.hasComponent(parentId, registry.Parent)) {
    return;
  }
  let head = ecs.ecs.getField(parentId, registry.Parent, "head") as EntityID | -1;
  let tail = ecs.ecs.getField(parentId, registry.Parent, "tail") as EntityID | -1;
  let count = ecs.ecs.getField(parentId, registry.Parent, "count") as number;
  const prevId = ecs.ecs.getField(childId, registry.Child, "prev") as EntityID | -1;
  const nextId = ecs.ecs.getField(childId, registry.Child, "next") as EntityID | -1;
  if (prevId === -1) {
    head = nextId;
  } else {
    ecs.setField(prevId, registry.Child, "next", nextId);
  }
  if (nextId === -1) {
    tail = prevId;
  } else {
    ecs.setField(nextId, registry.Child, "prev", prevId);
  }
  ecs.removeComponent(childId, registry.Child);
  --count;
  if (count <= 0) {
    ecs.removeComponent(parentId, registry.Parent);
  } else {
    ecs.setField(parentId, registry.Parent, "head", head);
    ecs.setField(parentId, registry.Parent, "tail", tail);
    ecs.setField(parentId, registry.Parent, "count", count);
  }
}
