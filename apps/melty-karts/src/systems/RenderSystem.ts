import { createMemo, onCleanup, createRoot, mapArray } from "solid-js";
import * as THREE from "three";
import type { ReactiveECS } from "@melty-karts/reactive-ecs";
import type { EntityID } from "@oasys/oecs";
import {
  RegisteredPosition,
  RegisteredPlayerConfig,
  RegisteredKartConfig,
} from "../World";
import { createSolidLogo } from "../models/SolidLogo";
import { loadKartModel } from "../models/Kart";

export function createRenderSystem(ecs: ReactiveECS, scene: THREE.Scene): { update: () => void; dispose: () => void } {
  return createRoot((dispose) => {

    createMemo(mapArray(
      createMemo(() => {
        let result: EntityID[] = [];
        for (let arch of ecs.query(RegisteredPosition, RegisteredPlayerConfig)) {
          let entityIds = arch.entity_ids;
          for (let i = 0; i < arch.entity_count; ++i) {
            result.push(entityIds[i] as EntityID);
          }
        }
        return result;
      }),
      async (kartEntityId) => {
        let kartEntity = ecs.entity(kartEntityId());
        let playerConfig = { 
          playerType: kartEntity.getField(RegisteredPlayerConfig, "playerType"), 
          facingForward: kartEntity.getField(RegisteredPlayerConfig, "facingForward") 
        };
        
        const kartGroup = new THREE.Group();
        const kartModel = await loadKartModel();
        kartGroup.add(kartModel);

        const solidLogo = createSolidLogo();
        solidLogo.position.set(0, 0.6, 0);
        solidLogo.scale.setScalar(0.5);
        kartGroup.add(solidLogo);

        scene.add(kartGroup);
        onCleanup(() => {
          scene.remove(kartGroup);
        });

        createMemo(() => {
          let positionX = kartEntity.getField(RegisteredPosition, "x");
          let positionY = kartEntity.getField(RegisteredPosition, "y");
          let positionZ = kartEntity.getField(RegisteredPosition, "z");
          let facingForward = kartEntity.getField(RegisteredPlayerConfig, "facingForward");
          
          kartGroup.position.set(positionX, positionY, positionZ);
          if (facingForward === 1) { 
            kartGroup.quaternion.set(0.0, 1.0, 0.0, 0.0);
          } else {
            kartGroup.quaternion.set(0.0, 0.0, 0.0, 1.0);
          }
        });
      },
    ));

    return { update: () => {}, dispose };
  });
}
