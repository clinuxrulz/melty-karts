import { type Accessor, createEffect, createSignal,  onCleanup, type Signal } from "solid-js";
import * as THREE from "three";
import type { ReactiveECS } from "@melty-karts/reactive-ecs";
import type { EntityID } from "@oasys/oecs";
import { RegisteredPosition, RegisteredVelocity, RegisteredPlayerConfig, RegisteredKartConfig, RegisteredKartRuntime, RegisteredNetworkSlot, RegisteredOrientation } from "./World";
import { PlayerTypeEnum } from "./components";

export function createKart(params: {
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  playerType: "Cubey" | "Melty",
  facingForward: boolean,
  reactiveEcs: ReactiveECS,
  networkSlot?: number,
}): EntityID {
  const ecs = params.reactiveEcs;
  
  const entityId = ecs.create_entity();
  ecs.add_component(entityId, RegisteredPosition, { x: params.position.x, y: params.position.y, z: params.position.z });
  ecs.add_component(entityId, RegisteredVelocity, { x: params.velocity.x, y: params.velocity.y, z: params.velocity.z });
  ecs.add_component(entityId, RegisteredOrientation, { x: 0.0, y: 0.0, z: 0.0, w: 1.0, });
  const playerTypeNum: PlayerTypeEnum = params.playerType === "Cubey" ? 0 : 1;
  const facingForwardNum: 0 | 1 = params.facingForward ? 1 : 0;
  ecs.add_component(entityId, RegisteredPlayerConfig, { playerType: playerTypeNum, facingForward: facingForwardNum });
  ecs.add_component(entityId, RegisteredKartConfig, { speed: 0.0 });
  ecs.add_component(entityId, RegisteredKartRuntime, {
    driftCharge: 0.0,
    isDrifting: 0,
    driftDirection: 0,
    verticalVelocity: 0.0,
  });
  if (params.networkSlot !== undefined) {
    ecs.add_component(entityId, RegisteredNetworkSlot, { slot: params.networkSlot });
  }
  
  return entityId;
}
