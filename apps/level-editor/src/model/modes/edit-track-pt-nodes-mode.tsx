import { Accessor, createMemo, createRenderEffect, createSignal, createStore, For, onCleanup, onSettled, Show, untrack } from "solid-js";
import * as THREE from "three";
import { Mode, ModeParams } from "../mode";
import { EntityID } from "@oasys/oecs";
import { constAccessor } from "../../util";
import { TransformControls } from "three/examples/jsm/Addons.js";
import { Entity } from "solid-three";
import { T } from "../../t";
import { Command } from "../commands";
import { whenDefined } from "../../when";
import { ValueSlider } from "three/examples/jsm/inspector/ui/Values.js";

export function createEditTrackPtNodesMode(params: {
  modeParams: ModeParams,
  trackId: string,
}): Mode {
  let [ state, setState, ] = createStore<{
    selectedTrackPtNodeById: EntityID | undefined,
  }>({
    selectedTrackPtNodeById: undefined,
  });
  let modeParams = params.modeParams;
  let componentRegistry = modeParams.componentRegistry;
  let trackId = params.trackId;
  let trackModelNode = modeParams.idToModelNodeMap().get(trackId);
  if (trackModelNode === undefined) {
    return {};
  }

  type TrackPtNodeUserData = {
    type: "TrackPtNodeUserData",
    trackPtNodeById: EntityID,
  };

  let raycaster = new THREE.Raycaster();
  let trackPtNodeUnderMouseById = createMemo(() => {
    let camera = modeParams.threeCamera();
    if (camera === undefined) {
      return;
    }
    let scene = modeParams.threeScene();
    if (scene === undefined) {
      return;
    }
    let mouseRay = modeParams.mouseRay();
    if (mouseRay === undefined) {
      return;
    }
    raycaster.camera = camera;
    raycaster.ray.copy(mouseRay);
    let intersections = raycaster.intersectObject(scene, true);
    for (let intersection of intersections) {
      if (intersection.face === null || intersection.face === undefined) {
        continue;
      }
      let object = intersection.object;
      if (object.userData.type === "TrackPtNodeUserData" satisfies TrackPtNodeUserData["type"]) {
        let userData = object.userData as TrackPtNodeUserData;
        return userData.trackPtNodeById;
      }
    }
    return undefined;
  });

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

  let transformControls = createMemo(() => {
    let camera = modeParams.threeCamera();
    if (camera === undefined) {
      return;
    }
    let canvas = modeParams.canvas();
    if (canvas === undefined) {
      return;
    }
    let transformControls = new TransformControls(
      camera,
      canvas,
    );
    transformControls.addEventListener("dragging-changed", (e) => setOrbitControlsEnabled(!e.value));
    transformControls.addEventListener("change", () => {
      let target = transformControls.object;
      if (target === undefined) {
        return;
      }
      let entityId = state.selectedTrackPtNodeById;
      if (entityId === undefined) {
        return;
      }
      modeParams.doCommand(
        Command.seq([
          Command.setField(
            entityId,
            componentRegistry.TrackPathPt,
            "px",
            target.position.x,
          ),
          Command.setField(
            entityId,
            componentRegistry.TrackPathPt,
            "py",
            target.position.y,
          ),
          Command.setField(
            entityId,
            componentRegistry.TrackPathPt,
            "pz",
            target.position.z,
          ),
        ]),
      );
    });
    onCleanup(() => {
      transformControls.detach();
    });
    return transformControls;
  });

  let selectedTrackPtNode = createMemo(() => (trackPtNodes() ?? []).find((x) => x.entityId === state.selectedTrackPtNodeById));

  let bidirectionalBind = (params: {
    input: HTMLInputElement,
    value: Accessor<number>,
    setValue: (x: number) => void,
  }) => {
    let selfSetting = false;
    let listener = () => {
      let value = Number.parseFloat(params.input.value.trim());
      if (Number.isNaN(value)) {
        return;
      }
      selfSetting = true;
      params.setValue(value);
    };
    createRenderEffect(
      params.value,
      (value) => {
        if (selfSetting) {
          selfSetting = false;
          return;
        }
        params.input.value = value.toFixed(3);
      },
    );
    params.input.addEventListener("input", listener);
    onCleanup(() => {
      params.input.removeEventListener("input", listener);
    });
  };

  let sideForm = whenDefined(
    selectedTrackPtNode,
    (trackPtNode) => () => (
      <div>
        <table>
          <thead/>
          <tbody>
            <tr>
              <td><label>Position X:</label></td>
              <td>
                <input
                  ref={(input) =>
                    bidirectionalBind({
                      input,
                      value: () => trackPtNode().pt().x,
                      setValue: (x) => {
                        params.modeParams.doCommand(
                          Command.setField(
                            trackPtNode().entityId,
                            componentRegistry.TrackPathPt,
                            "px",
                            x,
                          )
                        );
                      },
                    })
                  }
                  type="text"
                />
              </td>
            </tr>
            <tr>
              <td><label>Position Y:</label></td>
              <td>
                <input
                  ref={(input) =>
                    bidirectionalBind({
                      input,
                      value: () => trackPtNode().pt().y,
                      setValue: (x) => {
                        params.modeParams.doCommand(
                          Command.setField(
                            trackPtNode().entityId,
                            componentRegistry.TrackPathPt,
                            "py",
                            x,
                          )
                        );
                      },
                    })
                  }
                  type="text"
                />
              </td>
            </tr>
            <tr>
              <td><label>Position Z:</label></td>
              <td>
                <input
                  ref={(input) =>
                    bidirectionalBind({
                      input,
                      value: () => trackPtNode().pt().z,
                      setValue: (x) => {
                        params.modeParams.doCommand(
                          Command.setField(
                            trackPtNode().entityId,
                            componentRegistry.TrackPathPt,
                            "pz",
                            x,
                          )
                        );
                      },
                    })
                  }
                  type="text"
                />
              </td>
            </tr>
            <tr>
              <td><label>Twist:</label></td>
              <td>
                <input
                  ref={(input) =>
                    bidirectionalBind({
                      input,
                      value: () => trackPtNode().twist() * 180.0 / Math.PI,
                      setValue: (x) => {
                        params.modeParams.doCommand(
                          Command.setField(
                            trackPtNode().entityId,
                            componentRegistry.TrackPathPt,
                            "twist",
                            x * Math.PI / 180.0,
                          )
                        );
                      },
                    })
                  }
                  type="text"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    ),
  );

  let overlay3d = constAccessor(() => (
    <>
      {(() => {
        let controls = transformControls();
        if (controls === undefined) {
          return undefined;
        }
        return controls.getHelper();
      })()}
      <For each={trackPtNodes()}>
        {(trackPtNode) => {
          let [ object, setObject, ] = createSignal<THREE.Object3D>();
          let trackPtNode2 = untrack(trackPtNode);
          let highlighted = createMemo(() => trackPtNodeUnderMouseById() === trackPtNode2.entityId);
          let selected = createMemo(() => state.selectedTrackPtNodeById === trackPtNode2.entityId);
          createRenderEffect(
            selected,
            (selected) => {
              if (!selected) {
                return;
              }
              let object2 = object();
              if (object2 === undefined) {
                return;
              }
              transformControls()?.attach(object2);
            },
          )
          return (
            <T.Mesh
              ref={setObject}
              position={trackPtNode2.pt()}
              userData={{
                type: "TrackPtNodeUserData",
                trackPtNodeById: trackPtNode2.entityId,
              } satisfies TrackPtNodeUserData}
            >
              <T.SphereGeometry args={[1.0]}/>
              <T.MeshBasicMaterial
                color={highlighted() || selected() ? "#00FF00" : "#0000FF"}
                transparent
                opacity={0.5}
              />
            </T.Mesh>
          );
        }}
      </For>
    </>
  ));
  let onPointerDown = () => {
    let trackPtNodeById = trackPtNodeUnderMouseById();
    if (trackPtNodeById !== undefined) {
      setState((s) => { s.selectedTrackPtNodeById = trackPtNodeById; });
    }
  };
  return {
    sideForm,
    overlay3d,
    orbitControlsEnabled,
    onPointerDown,
  };
}
