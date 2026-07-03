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
  let targetX = ecs.ecs.getField(target, RegisteredPosition, "x");
  let targetY = ecs.ecs.getField(target, RegisteredPosition, "y");
  let targetZ = ecs.ecs.getField(target, RegisteredPosition, "z");
  if (ecs.ecs.hasComponent(target, RegisteredHasCarriedItems)) {
    head = ecs.ecs.getField(target, RegisteredHasCarriedItems, "head") as EntityID;
    tail = ecs.ecs.getField(target, RegisteredHasCarriedItems, "tail") as EntityID;
    count = ecs.ecs.getField(target, RegisteredHasCarriedItems, "count");
  } else {
    head = -1;
    tail = -1;
    count = 0;
  }
  ecs.addComponent(
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
  ecs.addComponent(
    carriedItem,
    RegisteredPosition,
    {
      x: targetX,
      y: targetY,
      z: targetZ,
    }
  );
  if (tail !== -1) {
    ecs.setField(tail, RegisteredCarriedItem, "next", carriedItem);
  }
  tail = carriedItem;
  ++count;
  if (ecs.ecs.hasComponent(target, RegisteredHasCarriedItems)) {
    ecs.setField(target, RegisteredHasCarriedItems, "tail", tail);
    ecs.setField(target, RegisteredHasCarriedItems, "count", count);
    if (head === -1) {
      head = tail;
      ecs.setField(target, RegisteredHasCarriedItems, "head", head);
    }
  } else {
    if (head === -1) {
      head = tail;
    }
    ecs.addComponent(target, RegisteredHasCarriedItems, {
      head,
      tail,
      count,
    });
  }
}

export function hasCarriedItem(ecs: ReactiveECS, target: EntityID): boolean {
  if (!ecs.ecs.hasComponent(target, RegisteredHasCarriedItems)) {
    return false;
  }
  let head = ecs.ecs.getField(target, RegisteredHasCarriedItems, "head") as EntityID;
  return head !== -1;
}

export function dropCarriedItem(ecs: ReactiveECS, target: EntityID): EntityID | undefined {
  if (!ecs.ecs.hasComponent(target, RegisteredHasCarriedItems)) {
    return undefined;
  }
  let head = ecs.ecs.getField(target, RegisteredHasCarriedItems, "head") as EntityID | -1;
  let tail = ecs.ecs.getField(target, RegisteredHasCarriedItems, "tail") as EntityID | -1;
  let count = ecs.ecs.getField(target, RegisteredHasCarriedItems, "count");
  if (head === -1 || tail === -1) {
    return undefined;
  }
  let tailPrev = ecs.ecs.getField(tail, RegisteredCarriedItem, "prev") as EntityID | -1;
  if (tailPrev !== -1) {
    ecs.setField(tail, RegisteredCarriedItem, "prev", -1);
    ecs.setField(tailPrev, RegisteredCarriedItem, "next", -1);
    ecs.setField(target, RegisteredHasCarriedItems, "tail", tailPrev);
  } else {
    ecs.setField(target, RegisteredHasCarriedItems, "head", -1);
    ecs.setField(target, RegisteredHasCarriedItems, "tail", -1);
  }
  ecs.setField(target, RegisteredHasCarriedItems, "count", count - 1);
  let item = ecs.ecs.getField(tail, RegisteredCarriedItem, "item") as Item;
  ecs.removeComponent(tail, RegisteredCarriedItem);
  if (item === Item.Banana) {
    ecs.addComponent(tail, RegisteredBanana, {});
  } else if (item === Item.Bomb) {
    ecs.addComponent(tail, RegisteredBomb, {
      timeoutUntilExplosion: BOMB_INITIAL_TIMEOUT_UNTIL_EXPLOSION,
    });
  } else {
    ecs.removeComponent(tail, RegisteredPosition);
    ecs.addComponent(tail, RegisteredFreeEntity);
  }
  return tail;
}
