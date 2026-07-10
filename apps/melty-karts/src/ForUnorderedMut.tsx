import {
  createSignal,
  createRoot,
  createComponent,
  runWithOwner,
  getOwner,
  createRenderEffect,
} from "solid-js";
import * as THREE from "three";
import { EntityID } from "@oasys/oecs";
import { JSX } from "@solidjs/web";
import { Portal } from "solid-three";
import { T } from "./t";

export interface ForUnorderedMutCtx {
  add(id: EntityID): void;
  remove(id: EntityID): void;
}

export function ForUnorderedMut(props: {
  ref: (ctx: ForUnorderedMutCtx) => void;
  children: (id: EntityID) => JSX.Element;
}): JSX.Element {
  let owner = getOwner();
  let [ group, setGroup, ] = createSignal<THREE.Group>();

  let idToCleanupMap = new Map<EntityID,() => void>();

  createRenderEffect(
    group,
    (group) => {
      if (group === undefined) {
        return;
      }
      props.ref({
        add(id: EntityID) {
          const dispose = createRoot((dispose) => {
            runWithOwner(owner, () => {
              createComponent(Portal, {
                element: group,
                get children() { return props.children(id); }
              });
            });
            return dispose;
          });
          idToCleanupMap.set(id, dispose);
        },
        remove(id: EntityID) {
          idToCleanupMap.get(id)?.();
        },
      });
    },
  );

  return (
    <T.Group ref={setGroup}/>
  );
}

