import { Accessor, createMemo, createRenderEffect, createSignal, For, Show, untrack } from "solid-js";
import * as THREE from "three";
import { Mode, ModeParams } from "../mode";
import { EntityID } from "@oasys/oecs";
import { constAccessor } from "../../util";
import { TransformControls } from "three/examples/jsm/Addons.js";
import { Entity } from "solid-three";
import { T } from "../../t";
import { Command } from "../commands";

export function createEditTrackPtNodesMode(params: {
  modeParams: ModeParams,
  trackId: string,
}): Mode {
  let modeParams = params.modeParams;
  let componentRegistry = modeParams.componentRegistry;
  let trackId = params.trackId;
  let trackModelNode = modeParams.idToModelNodeMap().get(trackId);
  if (trackModelNode === undefined) {
    return {};
  }
  let trackPtNodes = createMemo(() => {
    let parent = trackModelNode.findComponentData(modeParams.ecs, componentRegistry.Parent);
    if (parent === undefined) {
      return undefined;
    }
    let head = parent.head as EntityID | -1;
    if (head === -1) {
      return undefined;
    }
    let result: { entityId: EntityID, pt: Accessor<THREE.Vector3>, twist: Accessor<number>, }[] = [];
    let at = head;
    while (true) {
      let node = modeParams.ecs.entity(at);
      if (node === undefined) {
        break;
      }
      if (!node.hasComponent(componentRegistry.Child)) {
        break;
      }
      let next = node.getField(componentRegistry.Child, "next") as EntityID | -1;
      if (node.hasComponent(componentRegistry.TrackPathPt)) {
        let pt = createMemo(() => new THREE.Vector3(
          node.getField(componentRegistry.TrackPathPt, "px"),
          node.getField(componentRegistry.TrackPathPt, "py"),
          node.getField(componentRegistry.TrackPathPt, "pz"),
        ));
        let twist = createMemo(() => node.getField(componentRegistry.TrackPathPt, "twist"));
        result.push({
          entityId: at,
          pt,
          twist,
        });
      }
      if (next === -1) {
        break;
      }
      at = next;
    }
    if (result.length === 0) {
      return undefined;
    }
    return result;
  });
  let [ orbitControlsEnabled, setOrbitControlsEnabled, ] = createSignal(true);
  let overlay3d = constAccessor(() => (
    <Show when={modeParams.threeCamera()}>
      {(camera) => (
        <For each={trackPtNodes()}>
          {(trackPtNode) => {
            let [ target, setTarget, ] = createSignal<THREE.Group>();
            let transformControls = new TransformControls(
              camera(),
              modeParams.canvas(),
            );
            transformControls.addEventListener("dragging-changed", (e) => setOrbitControlsEnabled(!e.value));
            transformControls.addEventListener("change", () => {
              let target2 = target();
              if (target2 === undefined) {
                return;
              }
              let entityId = trackPtNode().entityId;
              modeParams.doCommand(
                Command.seq([
                  Command.setField(
                    entityId,
                    componentRegistry.TrackPathPt,
                    "px",
                    target2.position.x,
                  ),
                  Command.setField(
                    entityId,
                    componentRegistry.TrackPathPt,
                    "py",
                    target2.position.y,
                  ),
                  Command.setField(
                    entityId,
                    componentRegistry.TrackPathPt,
                    "pz",
                    target2.position.z,
                  ),
                ]),
              );
            });
            createRenderEffect(
              target,
              (target) => {
                if (target === undefined) {
                  return;
                }
                transformControls.attach(target);
                return () => {
                  transformControls.detach();
                };
              }
            );
            return (
              <>
                <T.Group
                  ref={setTarget}
                  position={trackPtNode().pt()}
                />
                <Entity from={transformControls.getHelper()}/>
              </>
            );
          }}
        </For>
      )}
    </Show>
  ));
  return {
    overlay3d,
    orbitControlsEnabled,
  };
}
