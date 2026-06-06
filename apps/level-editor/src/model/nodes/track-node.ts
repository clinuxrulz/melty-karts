import { createMemo } from "solid-js";
import * as THREE from "three";
import { ComponentRegistry } from "../components/registry";
import { TrackSchema } from "../components/track-component";
import { ResolvedModelNode } from "../model-node";
import { findComponentData, ModelNodeRegistry, ModelNodeType } from "../model-node-registry";
import { whenAllDefined } from "../../when";
import { EntityID } from "@oasys/oecs";

export function mkTrackNodeType(
  componentRegistry: ComponentRegistry,
  modelNodeRegistry: ModelNodeRegistry,
): ModelNodeType<TrackSchema> {
  return {
    typeName: "Track",
    componentType: componentRegistry.Track,
    resolve(params) {
      let track = createMemo(() => findComponentData(params.modelNode.components?.() ?? [], componentRegistry.Track)?.data);
      let trackPtNodes = createMemo(() => {
        let parent = findComponentData(params.modelNode.components?.() ?? [], componentRegistry.Parent)?.data;
        if (parent === undefined) {
          return undefined;
        }
        let head = parent.head as EntityID | -1;
        if (head === -1) {
          return undefined;
        }
        let result: { pt: THREE.Vector3, twist: number, }[] = [];
        let at = head;
        while (true) {
          let node = params.ecs.entity(at);
          if (node === undefined) {
            break;
          }
          if (!node.hasComponent(componentRegistry.Child)) {
            break;
          }
          let next = node.getField(componentRegistry.Child, "next") as EntityID | -1;
          if (node.hasComponent(componentRegistry.TrackPathPt)) {
            let pt = new THREE.Vector3(
              node.getField(componentRegistry.TrackPathPt, "px"),
              node.getField(componentRegistry.TrackPathPt, "py"),
              node.getField(componentRegistry.TrackPathPt, "pz"),
            );
            let twist = node.getField(componentRegistry.TrackPathPt, "twist");
            result.push({
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
      return whenAllDefined(
        [
          track,
          trackPtNodes,
        ],
        ([ track, trackPtNodes, ]) => {
          return new ResolvedModelNode({
            componentRegistry,
            modelNodeRegistry,
            stableName: params.modelNode.stableName,
          });
        },
      );
    },
  };
}
