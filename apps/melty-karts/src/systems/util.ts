import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { Item, RegisteredCarriedItem, RegisteredHasCarriedItems, RegisteredPosition } from "../World";
import { EntityID } from "@oasys/oecs";

export function addCarriedItem(ecs: ReactiveECS, target: EntityID, item: Item) {
  let carriedItem = ecs.create_entity();
  let head: EntityID | -1;
  let tail: EntityID | -1;
  let count: number;
  let targetX = ecs.ecs.get_field(target, RegisteredPosition, "x");
  let targetY = ecs.ecs.get_field(target, RegisteredPosition, "y");
  let targetZ = ecs.ecs.get_field(target, RegisteredPosition, "z");
  if (ecs.ecs.has_component(target, RegisteredHasCarriedItems)) {
    head = ecs.ecs.get_field(target, RegisteredHasCarriedItems, "head") as EntityID;
    tail = ecs.ecs.get_field(target, RegisteredHasCarriedItems, "tail") as EntityID;
    count = ecs.ecs.get_field(target, RegisteredHasCarriedItems, "count");
  } else {
    head = -1;
    tail = -1;
    count = 0;
  }
  ecs.add_component(
    carriedItem,
    RegisteredCarriedItem,
    {
      owner: target,
      item,
      prev: tail,
      next: -1,
      maxDistance: 1.2 + count * 0.8,
    },
  );
  ecs.add_component(
    carriedItem,
    RegisteredPosition,
    {
      x: targetX,
      y: targetY,
      z: targetZ,
    }
  );
  if (tail !== -1) {
    ecs.set_field(tail, RegisteredCarriedItem, "next", carriedItem);
  }
  tail = carriedItem;
  ++count;
  if (ecs.ecs.has_component(target, RegisteredHasCarriedItems)) {
    ecs.set_field(target, RegisteredHasCarriedItems, "tail", tail);
    ecs.set_field(target, RegisteredHasCarriedItems, "count", count);
    if (head === -1) {
      head = tail;
      ecs.set_field(target, RegisteredHasCarriedItems, "head", head);
    }
  } else {
    if (head === -1) {
      head = tail;
    }
    ecs.add_component(target, RegisteredHasCarriedItems, {
      head,
      tail,
      count,
    });
  }
}
