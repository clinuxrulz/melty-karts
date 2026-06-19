import { createMemo, getOwner, runWithOwner } from "solid-js";
import * as THREE from "three";
import { ComponentRegistry, generateTrackCurve, obtainTrackPtNodes, RenderTrack, TrackSchema } from "@melty-karts/modelling";
import { ResolvedModelNode } from "../model-node";
import {ModelNodeRegistry, ModelNodeType } from "../model-node-registry";
import { whenAllDefined } from "../../when";
import { EntityID } from "@oasys/oecs";
import { bidirectionalBindForInputNumber, constAccessor } from "../../util";
import { Command } from "../commands";
import { Operation } from "../operation";
import { TSL, MeshBasicNodeMaterial } from "three/webgpu";
const { uniform, attribute, Fn, vec3, vec4, fract, abs, mix, clamp, div } = TSL;

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
        let trackId = params.modelNode.entityId;
        if (trackId === undefined) {
          return undefined;
        }
        return obtainTrackPtNodes({
          componentRegistry: componentRegistry,
          ecs: params.ecs,
          trackId,
        });
      });
      return whenAllDefined(
        [
          track,
          trackPtNodes,
        ],
        ([ track, trackPtNodes, ]) => {
          let curve = createMemo(() =>
            generateTrackCurve({
              trackPtNodes: trackPtNodes(),
            })
          );
          let hasTrackPtNodes = createMemo(() => trackPtNodes().length > 0);
          let render = createMemo(() => {
            if (!hasTrackPtNodes()) {
              return undefined;
            }
            return (props: { ref: (self: THREE.Object3D) => void, }) => (
              <RenderTrack
                ref={props.ref}
                track={track()}
                trackPtNodes={trackPtNodes()}
                curve={curve()}
                isSelected={params.isSelected()}
              />
            );
          });
          let propertiesForm = constAccessor((formProps: { doOperation: (operation: Operation) => void, doCommand: (command: Command, addUndo?: boolean, undoDescription?: string) => void, }) => {
            let owner = getOwner();
            return (
              <div>
                <label>
                  <span style="width: 5px;">Width:</span>
                  <input
                    ref={(input) =>
                      runWithOwner(
                        owner,
                        () => bidirectionalBindForInputNumber({
                          input,
                          value: createMemo(() => track().width),
                          setValue: (value) => {
                            let self = params.self();
                            if (self === undefined) {
                              return;
                            }
                            let entityId = Number.parseInt(self.stableName) as EntityID;
                            if (Number.isNaN(entityId)) {
                              return;
                            }
                            formProps.doCommand(
                              Command.setField(
                                entityId,
                                componentRegistry.Track,
                                "width",
                                value,
                              ),
                              true,
                              "Edit Track",
                            );
                          },
                        })
                      )
                    }
                    class="input"
                    type="text"
                  />
                </label>
                <hr/>
                <button
                  class="btn btn-primary"
                  onClick={() => {
                    let self = params.self();
                    if (self === undefined) {
                      return;
                    }
                    formProps.doOperation(
                      Operation.editTrackNodes(self.stablePath())
                    );
                  }}
                >
                  Edit Nodes
                </button>
              </div>
            );
          });
          return new ResolvedModelNode({
            componentRegistry,
            modelNodeRegistry,
            stableName: params.modelNode.stableName,
            render,
            propertiesForm,
          });
        },
      );
    },
  };
}
