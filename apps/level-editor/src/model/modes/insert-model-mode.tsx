import * as THREE from "three";
import { Mode, ModeParams } from "../mode";
import { createMemo, createSignal, onCleanup } from "solid-js";
import { whenDefined } from "../../when";
import { Command } from "../commands";
import { EntityID } from "@oasys/oecs";

export function createInsertModelMode(modeParams: ModeParams): Mode {
  let componentRegistry = modeParams.componentRegistry;
  let groundPlane = new THREE.Plane();
  groundPlane.normal.set(0, 1, 0);
  groundPlane.constant = 0;
  let _workingPt_pt = new THREE.Vector3();
  let workingPt = createMemo(
    () => {
      let mouseRay = modeParams.mouseRay();
      if (mouseRay === undefined) {
        return undefined;
      }
      return mouseRay.intersectPlane(groundPlane, _workingPt_pt);
    },
    { equals: false, },
  );
  whenDefined(
    workingPt,
    (workingPt) => {
      let [ propId, setPropId, ] = createSignal<EntityID>();
      modeParams.doCommand(
        Command.createEntity(
          (entityId) => {
            queueMicrotask(() => {
              setPropId(entityId);
            });
            return Command.addComponent(
              entityId,
              componentRegistry.Model,
              {
                modelId: 0,
              },
            );
          }
        )
      );
      onCleanup(() => {
        let propId2 = propId();
        if (propId2 !== undefined) {
          modeParams.doCommand(Command.destroyEntity(propId2));
        }
      });
    },
  );
  return {};
}
