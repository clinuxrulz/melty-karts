import { ReactiveECS } from "@melty-karts/reactive-ecs";
import * as THREE from "three";
import { MYSTERY_BOX_RESPAWN_TIMEOUT, RegisteredMysteryBox, RegisteredPosition } from "../World";
import { TRACK_WIDTH } from "../models/Track";

export function placeMysteryBoxesAlongTrack(ecs: ReactiveECS, track: THREE.CatmullRomCurve3) {
  const numMysteryBoxes = 20;
  const rng = mulberry32(42);
  let pt = new THREE.Vector3();
  let dir = new THREE.Vector3();
  let perp = new THREE.Vector3();
  let up = new THREE.Vector3(0.0, 1.0, 0.0);
  for (let i = 0; i < numMysteryBoxes; ++i) {
    let t = rng();
    track.getPointAt(t, pt);
    track.getTangentAt(t, dir);
    perp.crossVectors(dir, up);
    let u = (rng() - 0.5) * TRACK_WIDTH;
    pt.addScaledVector(perp, u);
    let mysteryBox = ecs.create_entity();
    ecs.add_component(
      mysteryBox,
      RegisteredMysteryBox,
      {
        angle: rng() * 2.0 * Math.PI,
        spawned: 1,
        timeUntilRespawn: MYSTERY_BOX_RESPAWN_TIMEOUT,
      }
    );
    ecs.add_component(
      mysteryBox,
      RegisteredPosition,
      {
        x: pt.x,
        y: pt.y,
        z: pt.z,
      },
    );
  }
}

export function mulberry32(a: number) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

