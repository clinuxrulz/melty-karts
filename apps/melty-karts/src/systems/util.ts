import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { Item, RegisteredBanana, RegisteredBomb, RegisteredCarriedItem, RegisteredHasCarriedItems, RegisteredPosition } from "../World";
import { EntityID } from "@oasys/oecs";
import { EcsCommands } from "../EcsCommands";

export function addCarriedItem(ecs: ReactiveECS, ecsCommands: EcsCommands, target: EntityID, item: Item) {
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
  ecsCommands.add_component(
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
  ecsCommands.add_component(
    carriedItem,
    RegisteredPosition,
    {
      x: targetX,
      y: targetY,
      z: targetZ,
    }
  );
  if (tail !== -1) {
    ecsCommands.set_field(tail, RegisteredCarriedItem, "next", carriedItem);
  }
  tail = carriedItem;
  ++count;
  if (ecs.ecs.has_component(target, RegisteredHasCarriedItems)) {
    ecsCommands.set_field(target, RegisteredHasCarriedItems, "tail", tail);
    ecsCommands.set_field(target, RegisteredHasCarriedItems, "count", count);
    if (head === -1) {
      head = tail;
      ecsCommands.set_field(target, RegisteredHasCarriedItems, "head", head);
    }
  } else {
    if (head === -1) {
      head = tail;
    }
    ecsCommands.add_component(target, RegisteredHasCarriedItems, {
      head,
      tail,
      count,
    });
  }
}

export function hasCarriedItem(ecs: ReactiveECS, target: EntityID): boolean {
  if (!ecs.ecs.has_component(target, RegisteredHasCarriedItems)) {
    return false;
  }
  let head = ecs.ecs.get_field(target, RegisteredHasCarriedItems, "head") as EntityID;
  return head !== -1;
}

export function dropCarriedItem(ecs: ReactiveECS, ecsCommands: EcsCommands, target: EntityID) {
  if (!ecs.ecs.has_component(target, RegisteredHasCarriedItems)) {
    return;
  }
  let head = ecs.ecs.get_field(target, RegisteredHasCarriedItems, "head") as EntityID | -1;
  let tail = ecs.ecs.get_field(target, RegisteredHasCarriedItems, "tail") as EntityID | -1;
  let count = ecs.ecs.get_field(target, RegisteredHasCarriedItems, "count");
  if (head === -1 || tail === -1) {
    return;
  }
  let tailPrev = ecs.ecs.get_field(tail, RegisteredCarriedItem, "prev") as EntityID | -1;
  if (tailPrev !== -1) {
    ecsCommands.set_field(tail, RegisteredCarriedItem, "prev", -1);
    ecsCommands.set_field(tailPrev, RegisteredCarriedItem, "next", -1);
    ecsCommands.set_field(target, RegisteredHasCarriedItems, "tail", tailPrev);
  } else {
    ecsCommands.set_field(target, RegisteredHasCarriedItems, "head", -1);
    ecsCommands.set_field(target, RegisteredHasCarriedItems, "tail", -1);
  }
  ecsCommands.set_field(target, RegisteredHasCarriedItems, "count", count - 1);
  let item = ecs.ecs.get_field(tail, RegisteredCarriedItem, "item") as Item;
  ecsCommands.remove_component(tail, RegisteredCarriedItem);
  if (item === Item.Banana) {
    ecsCommands.add_component(tail, RegisteredBanana, {});
  } else if (item === Item.Bomb) {
    ecsCommands.add_component(tail, RegisteredBomb, {});
  } else {
    ecsCommands.destroy_entity(tail);
  }
}
