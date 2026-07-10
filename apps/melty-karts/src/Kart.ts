import { type Accessor, createEffect, createSignal,  onCleanup, type Signal } from "solid-js";
import * as THREE from "three";
import type { ReactiveECS } from "@melty-karts/reactive-ecs";
import type { EntityID } from "@oasys/oecs";
import { RegisteredPosition, RegisteredVelocity, RegisteredPlayerConfig, RegisteredKartConfig, RegisteredKartRuntime, RegisteredNetworkSlot, RegisteredOrientation, RegisteredInputControlled } from "./World";
import { PlayerTypeEnum } from "./components";

export function createKart(params: {
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  playerType: "Cubey" | "Melty" | "Solid",
  facingForward: boolean,
  reactiveEcs: ReactiveECS,
  networkSlot?: number,
}): EntityID {
  const ecs = params.reactiveEcs;
  
  const entityId = ecs.spawn();
  ecs.addComponent(entityId, RegisteredPosition, { x: params.position.x, y: params.position.y, z: params.position.z });
  ecs.addComponent(entityId, RegisteredVelocity, { x: params.velocity.x, y: params.velocity.y, z: params.velocity.z });
  ecs.addComponent(entityId, RegisteredOrientation, { x: 0.0, y: 0.0, z: 0.0, w: 1.0, });
  const playerTypeNum: PlayerTypeEnum = params.playerType === "Melty" ? 0 : params.playerType === "Cubey" ? 1 : 2;
  const facingForwardNum: 0 | 1 = params.facingForward ? 1 : 0;
  ecs.addComponent(entityId, RegisteredPlayerConfig, { playerType: playerTypeNum, facingForward: facingForwardNum, useItemWasDown: 0 });
  ecs.addComponent(entityId, RegisteredKartConfig, { speed: 0.0 });
  ecs.addComponent(entityId, RegisteredKartRuntime, {
    driftCharge: 0.0,
    isDrifting: 0,
    driftDirection: 0,
    verticalVelocity: 0.0,
  });
  ecs.addComponent(entityId, RegisteredInputControlled, { useItemDown: 0, upDown: 0, });
  if (params.networkSlot !== undefined) {
    ecs.addComponent(entityId, RegisteredNetworkSlot, { slot: params.networkSlot });
  }
  
  return entityId;
}
