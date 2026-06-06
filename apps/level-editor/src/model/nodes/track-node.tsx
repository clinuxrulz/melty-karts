import { createMemo, onCleanup } from "solid-js";
import * as THREE from "three";
import { ComponentRegistry } from "../components/registry";
import { TrackSchema } from "../components/track-component";
import { ResolvedModelNode } from "../model-node";
import { findComponentData, ModelNodeRegistry, ModelNodeType } from "../model-node-registry";
import { whenAllDefined } from "../../when";
import { EntityID } from "@oasys/oecs";
import { CatmullRomCurve4 } from "../catmull-rom-curve4";
import { TrackEvaluator } from "../track-evaluator";
import { T } from "../../t";

export function mkTrackNodeType(
  componentRegistry: ComponentRegistry,
  modelNodeRegistry: ModelNodeRegistry,
): ModelNodeType<TrackSchema> {
  return {
    typeName: "Track",
    componentType: componentRegistry.Track,
    resolve(params) {
      let track = createMemo(() => params.modelNode.findComponentData(params.ecs, componentRegistry.Track));
      let trackPtNodes = createMemo(() => {
        let parent = params.modelNode.findComponentData(params.ecs, componentRegistry.Parent);
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
          let curve = createMemo(() => {
            let trackPtNodes2 = trackPtNodes();
            let curve2 = new CatmullRomCurve4(
              trackPtNodes2.map(({ pt, twist }) => new THREE.Vector4(pt.x, pt.y, pt.z, twist)),
              true,
            );
            let length = 0.0;
            let v4 = new THREE.Vector4();
            let lastPt = new THREE.Vector3();
            let pt = new THREE.Vector3();
            curve2.getPoint(0, v4);
            lastPt.set(v4.x, v4.y, v4.z);
            for (let i = 1; i < 1000; ++i) {
              let t = i / 999.0;
              curve2.getPoint(t, v4);
              pt.set(v4.x, v4.y, v4.z);
              let dist = lastPt.distanceTo(pt);
              length += dist;
              lastPt.set(pt.x, pt.y, pt.z);
            }
            console.log("track length", length);
            return {
              curve: curve2,
              length,
            }
          });
          let render = createMemo(() => {
            let curve2 = curve();
            let trackEval = new TrackEvaluator(
              curve2.curve,
              200,
            );
            let shape = new THREE.Shape();
            shape.moveTo(-3.0, -0.3);
            shape.lineTo(3.0, -0.3);
            shape.lineTo(3.0, 0.0);
            shape.lineTo(-3.0, 0.0);
            shape.closePath();
            let geometry = new THREE.ExtrudeGeometry(
              shape,
              {
                bevelEnabled: false,
                depth: curve2.length,
                steps: 50.0,
              },
            );
            let points = geometry.getAttribute("position");
            for (let i = 0; i < points.count; ++i) {
              let x = points.getX(i);
              let y = points.getY(i);
              let z = points.getZ(i);
              let t = Math.max(0.0, Math.min(1.0, z / curve2.length));
              let frame = trackEval.getFrameAt(t);
              let px = frame.position.x + frame.right.x * x - frame.up.x * y;
              let py = frame.position.y + frame.right.y * x - frame.up.y * y;
              let pz = frame.position.z + frame.right.z * x - frame.up.z * y;
              points.setXYZ(i, px, py, pz);
            }
            points.needsUpdate = true;
            onCleanup(() => geometry.dispose());
            return () => (
              <T.Mesh
                geometry={geometry}
              >
                <T.MeshNormalMaterial/>
              </T.Mesh>
            );
          });
          return new ResolvedModelNode({
            componentRegistry,
            modelNodeRegistry,
            stableName: params.modelNode.stableName,
            render,
          });
        },
      );
    },
  };
}
