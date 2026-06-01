import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { RegisteredFreeEntity, RegisteredRng } from "./World";
import { EntityID } from "@oasys/oecs";

let _rnd_result: [ number, number, ] = [ 0, 0.0, ];
export function rng(ecs: ReactiveECS): number {
  let seed = ecs.ecs.resource(RegisteredRng).seed;
  mulberry32v2(seed, _rnd_result);
  seed = _rnd_result[0];
  ecs.set_resource(RegisteredRng, { seed, });
  return _rnd_result[1];
}

export function mulberry32v2(seed: number, out: [ seed: number, value: number, ]) {
  let t = seed += 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  let value = ((t ^ t >>> 14) >>> 0) / 4294967296;
  out[0] = seed;
  out[1] = value;
}


export function getFreeEntityOrCreate(ecs: ReactiveECS): EntityID {
  let query = ecs.ecs.query(RegisteredFreeEntity);
  for (let i = 0; i < query.archetype_count; ++i) {
    let arch = query.archetypes[i];
    for (let j = 0; j < arch.entity_count; ++j) {
      let entityId = arch.entity_ids[j] as EntityID;
      ecs.remove_component(entityId, RegisteredFreeEntity);
      return entityId;
    }
  }
  return ecs.create_entity();
}
