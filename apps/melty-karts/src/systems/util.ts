import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { BOMB_INITIAL_TIMEOUT_UNTIL_EXPLOSION, Item, RegisteredBanana, RegisteredBomb, RegisteredCarriedItem, RegisteredFreeEntity, RegisteredHasCarriedItems, RegisteredPosition } from "../World";
import { EntityID } from "@oasys/oecs";
import { EcsCommands } from "../EcsCommands";
import { getFreeEntityOrCreate } from "../util";

export function addCarriedItem(ecs: ReactiveECS, target: EntityID, item: Item) {
  let carriedItem = getFreeEntityOrCreate(ecs);
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

export function hasCarriedItem(ecs: ReactiveECS, target: EntityID): boolean {
  if (!ecs.ecs.has_component(target, RegisteredHasCarriedItems)) {
    return false;
  }
  let head = ecs.ecs.get_field(target, RegisteredHasCarriedItems, "head") as EntityID;
  return head !== -1;
}

export function dropCarriedItem(ecs: ReactiveECS, target: EntityID) {
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
    ecs.set_field(tail, RegisteredCarriedItem, "prev", -1);
    ecs.set_field(tailPrev, RegisteredCarriedItem, "next", -1);
    ecs.set_field(target, RegisteredHasCarriedItems, "tail", tailPrev);
  } else {
    ecs.set_field(target, RegisteredHasCarriedItems, "head", -1);
    ecs.set_field(target, RegisteredHasCarriedItems, "tail", -1);
  }
  ecs.set_field(target, RegisteredHasCarriedItems, "count", count - 1);
  let item = ecs.ecs.get_field(tail, RegisteredCarriedItem, "item") as Item;
  ecs.remove_component(tail, RegisteredCarriedItem);
  if (item === Item.Banana) {
    ecs.add_component(tail, RegisteredBanana, {});
  } else if (item === Item.Bomb) {
    ecs.add_component(tail, RegisteredBomb, {
      timeoutUntilExplosion: BOMB_INITIAL_TIMEOUT_UNTIL_EXPLOSION,
    });
  } else {
    ecs.remove_component(tail, RegisteredPosition);
    ecs.add_component(tail, RegisteredFreeEntity);
  }
}
