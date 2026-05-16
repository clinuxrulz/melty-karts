import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { RegisteredRng } from "./World";

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

