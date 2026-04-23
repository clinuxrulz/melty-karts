import { createEffect, createMemo, onCleanup, createRoot, mapArray, createRenderEffect } from "solid-js";
import * as THREE from "three";
import type { ReactiveECS } from "@melty-karts/reactive-ecs";
import type { EntityID } from "@oasys/oecs";
import {
  RegisteredPosition,
  RegisteredPlayerConfig,
  RegisteredKartConfig,
  RegisteredOrientation,
} from "../World";
import { createSolidLogo } from "../models/SolidLogo";
import { loadKartModel } from "../models/Kart";
import { createMelty } from "../models/melty";
import { createCubey } from "../models/cubey";

export function createRenderSystem(ecs: ReactiveECS, scene: THREE.Scene): { update: () => void; dispose: () => void } {
  return createRoot((dispose) => {

    createMemo(mapArray(
      createMemo(() => {
        let result: EntityID[] = [];
        for (let arch of ecs.query(RegisteredPosition, RegisteredOrientation, RegisteredPlayerConfig)) {
          let entityIds = arch.entity_ids;
          for (let i = 0; i < arch.entity_count; ++i) {
            result.push(entityIds[i] as EntityID);
          }
        }
        return result;
      }),
      (kartEntityId) => {
        let kartEntity = ecs.entity(kartEntityId());
        let playerConfig = { 
          playerType: kartEntity.getField(RegisteredPlayerConfig, "playerType"), 
          facingForward: kartEntity.getField(RegisteredPlayerConfig, "facingForward") 
        };
        
        const kartGroup = new THREE.Group();
        createRenderEffect(
          async () => await loadKartModel(),
          (kartModel) => {
            kartGroup.add(kartModel);
          },
        );

        const playerType = playerConfig.playerType;
        if (playerType === 0) {
          const cubey = createCubey();
          cubey.position.set(0, 0.32, 0);
          cubey.scale.setScalar(0.5);
          kartGroup.add(cubey);
        } else if (playerType === 1) {
          const melty = createMelty();
          melty.position.set(0, 0.32, 0);
          melty.scale.setScalar(0.5);
          kartGroup.add(melty);
        } else {
          const solidLogo = createSolidLogo();
          solidLogo.position.set(0, 0.32, 0);
          solidLogo.scale.setScalar(0.5);
          kartGroup.add(solidLogo);
        }

        scene.add(kartGroup);
        onCleanup(() => {
          scene.remove(kartGroup);
        });

        createMemo(() => {
          let positionX = kartEntity.getField(RegisteredPosition, "x");
          let positionY = kartEntity.getField(RegisteredPosition, "y");
          let positionZ = kartEntity.getField(RegisteredPosition, "z");
          let qX = kartEntity.getField(RegisteredOrientation, "x");
          let qY = kartEntity.getField(RegisteredOrientation, "y");
          let qZ = kartEntity.getField(RegisteredOrientation, "z");
          let qW = kartEntity.getField(RegisteredOrientation, "w");
          
          kartGroup.position.set(positionX, positionY, positionZ);
          kartGroup.quaternion.set(qX, qY, qZ, qW);
        });
      },
    ));

    return { update: () => {}, dispose };
  });
}
