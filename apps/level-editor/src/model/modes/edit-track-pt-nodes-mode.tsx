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
import { CatmullRomCurve4 } from "../catmull-rom-curve4";
import { entityAddChildBeforeChild, entityRemoveChild } from "../components/parent-component";

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

  type AddTrackPtNodeUserData = {
    type: "AddTrackPtNodeUserData",
    insertAtIndex: number,
    tValue: number,
  };

  let raycaster = new THREE.Raycaster();
  let selectableUnderMouse = createMemo<
    | { type: "TrackPtNode", entityId: EntityID, }
    | { type: "AddTrackPtNode", insertAtIndex: number, tValue: number, }
    | undefined
  >(() => {
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
        return {
          type: "TrackPtNode",
          entityId: userData.trackPtNodeById,
        };
      } else if (object.userData.type === "AddTrackPtNodeUserData" satisfies AddTrackPtNodeUserData["type"]) {
        let userData = object.userData as AddTrackPtNodeUserData;
        return {
          type: "AddTrackPtNode",
          insertAtIndex: userData.insertAtIndex,
          tValue: userData.tValue,
        };
      }
    }
    return undefined;
  });

  let trackPtNodeUnderMouseById = createMemo(() => {
    let selectableUnderMouse2 = selectableUnderMouse();
    if (selectableUnderMouse2?.type !== "TrackPtNode") {
      return undefined;
    }
    return selectableUnderMouse2.entityId;
  });

  let addTrackPtNodeUnderMouse = createMemo(
    () => {
      let selectableUnderMouse2 = selectableUnderMouse();
      if (selectableUnderMouse2?.type !== "AddTrackPtNode") {
        return undefined;
      }
      return {
        insertAtIndex: selectableUnderMouse2.insertAtIndex,
        tValue: selectableUnderMouse2.tValue,
      };
    },
    {
      equals(prev, next) {
        if (next === undefined) {
          return prev === undefined;
        } else if (prev === undefined) {
          return false;
        } else {
          return next.insertAtIndex === prev.insertAtIndex && next.tValue === prev.tValue;
        }
      },
    }
  );

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

  let curve = createMemo(() => {
    let trackPtNodes2 = trackPtNodes();
    if (trackPtNodes2 === undefined) {
      return undefined;
    }
    let curve2 = new CatmullRomCurve4(
      trackPtNodes2.map(({ pt, twist }) => new THREE.Vector4(pt().x, pt().y, pt().z, twist())),
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

  let trackPtNodeTValues = createMemo(() => {
    let trackPtNodes2 = trackPtNodes();
    if (trackPtNodes2 === undefined) {
      return undefined;
    }
    let n = trackPtNodes2.length;
    let result: number[] = new Array(n);
    for (let i = 0; i < n; ++i) {
      result[i] = i / n;
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

  let selectedTrackPtNode = createMemo(() => {
    let trackPtNodes2 = trackPtNodes();
    if (trackPtNodes2 === undefined) {
      return undefined;
    }
    let idx = trackPtNodes2.findIndex((x) => x.entityId === state.selectedTrackPtNodeById);
    if (idx === -1) {
      return undefined;
    }
    return { trackPtNode: trackPtNodes2[idx], index: idx, };
  });

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
      <Show when={trackPtNode()}>
        {(trackPtNode) => (
        <div>
          <table>
            <thead/>
            <tbody>
              <Show when={trackPtNodeTValues()}>
                {(trackPtNodeTValues) => (
                  <tr>
                    <td>T Value</td>
                    <td>{trackPtNodeTValues()[trackPtNode().index].toFixed(3)}</td>
                  </tr>
                )}
              </Show>
              <tr>
                <td><label style={{ "text-wrap": "nowrap", }}>Position X:</label></td>
                <td>
                  <input
                    ref={(input) =>
                      bidirectionalBind({
                        input,
                        value: () => trackPtNode().trackPtNode.pt().x,
                        setValue: (x) => {
                          params.modeParams.doCommand(
                            Command.setField(
                              trackPtNode().trackPtNode.entityId,
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
                <td><label style={{ "text-wrap": "nowrap", }}>Position Y:</label></td>
                <td>
                  <input
                    ref={(input) =>
                      bidirectionalBind({
                        input,
                        value: () => trackPtNode().trackPtNode.pt().y,
                        setValue: (x) => {
                          params.modeParams.doCommand(
                            Command.setField(
                              trackPtNode().trackPtNode.entityId,
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
                <td><label style={{ "text-wrap": "nowrap", }}>Position Z:</label></td>
                <td>
                  <input
                    ref={(input) =>
                      bidirectionalBind({
                        input,
                        value: () => trackPtNode().trackPtNode.pt().z,
                        setValue: (x) => {
                          params.modeParams.doCommand(
                            Command.setField(
                              trackPtNode().trackPtNode.entityId,
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
                        value: () => trackPtNode().trackPtNode.twist() * 180.0 / Math.PI,
                        setValue: (x) => {
                          params.modeParams.doCommand(
                            Command.setField(
                              trackPtNode().trackPtNode.entityId,
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
              <tr>
                <td colspan={2}>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={5}
                    value={trackPtNode().trackPtNode.twist() * 180.0 / Math.PI}
                    onInput={(e) => {
                      let value = Number.parseFloat(e.currentTarget.value);
                      if (Number.isNaN(value)) {
                        return;
                      }
                      params.modeParams.doCommand(
                        Command.setField(
                          trackPtNode().trackPtNode.entityId,
                          componentRegistry.TrackPathPt,
                          "twist",
                          value * Math.PI / 180.0,
                        )
                      );
                    }}
                  />
                </td>
              </tr>
              <tr>
                <td colspan={2}>
                  <button
                    class="btn btn-primary"
                    disabled={(() => {
                      let trackPtNodes2 = trackPtNodes();
                      if (trackPtNodes2 == undefined) {
                        return true;
                      }
                      return trackPtNodes2.length <= 3;
                    })()}
                    onClick={() => {
                      //alert("TODO");
                      entityRemoveChild(
                        componentRegistry,
                        modeParams.ecs,
                        trackPtNode().trackPtNode.entityId,
                      );
                    }}
                  >
                    Delete Node
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        )}
      </Show>
    ),
  );

  let plusMaterial = createMemo(() => {
    let canvas = new OffscreenCanvas(32, 32);
    let ctx = canvas.getContext("2d");
    if (ctx === null) {
      return undefined;
    }
    ctx.fillStyle = "white";
    ctx.font = "bold 24px serif";
    ctx.fillText("+", 9, 24);
    let texture = new THREE.CanvasTexture(canvas);
    let material = new THREE.PointsMaterial({
      map: texture,
      size: 4,
      depthTest: false,
      transparent: true,
    });
    onCleanup(() => {
      texture.dispose();
      material.dispose();
    });
    return material;
  });

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
            () => [
              selected(),
              object(),
            ] as const,
            ([ selected, object ]) => {
              if (!selected || object === undefined) {
                return;
              }
              transformControls()?.attach(object);
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
      <Show when={curve()}>
        {(curve) => (
          <Show when={trackPtNodeTValues()}>
            {(trackPtNodeTValues) => (
              <Show when={(() => {
                let trackPtNodeTValues2 = trackPtNodeTValues();
                if (trackPtNodeTValues2.length < 3) {
                  return undefined;
                }
                return selectedTrackPtNode();
              })()}>
                {(trackPtNode) => {
                  let lastInsertPtTValue = createMemo(() => {
                    let idx = trackPtNode().index;
                    let prevTValue = trackPtNodeTValues()[(idx - 1 + trackPtNodeTValues().length) % trackPtNodeTValues().length];
                    let atTValue = trackPtNodeTValues()[idx];
                    if (atTValue < prevTValue) {
                      atTValue += 1.0;
                    }
                    let tValue = (0.5 * (prevTValue + atTValue)) % 1.0;
                    return { tValue, insertAtIdx: idx, };
                  });
                  let nextInsertPtTValue = createMemo(() => {
                    let idx = trackPtNode().index;
                    let atTValue = trackPtNodeTValues()[idx];
                    let nextTValue = trackPtNodeTValues()[(idx + 1) % trackPtNodeTValues().length];
                    if (nextTValue < atTValue) {
                      nextTValue += 1.0;
                    }
                    let tValue = (0.5 * (atTValue + nextTValue)) % 1.0;
                    return { tValue, insertAtIdx: (idx + 1) % trackPtNodeTValues().length, };
                  });
                  return (
                    <For each={[ lastInsertPtTValue(), nextInsertPtTValue(), ]}>
                      {(tValue) => {
                        let pt = createMemo(() => curve().curve.getPoint(tValue().tValue));
                        let highlighted = createMemo(() => addTrackPtNodeUnderMouse()?.insertAtIndex === tValue().insertAtIdx);
                        return (
                          <>
                            <T.Mesh
                              position={new THREE.Vector3().copy(pt())}
                              renderOrder={1}
                              userData={{
                                type: "AddTrackPtNodeUserData",
                                insertAtIndex: tValue().insertAtIdx,
                                tValue: tValue().tValue,
                              } satisfies AddTrackPtNodeUserData}
                            >
                              <T.SphereGeometry args={[ 0.8, ]}/>
                              <T.MeshBasicMaterial color={highlighted() ? "green" : "red"} transparent opacity={0.5} depthTest={false}/>
                            </T.Mesh>
                            <T.Points
                              material={plusMaterial()}
                              renderOrder={2}
                              position={new THREE.Vector3().copy(pt())}
                            >
                              <T.BufferGeometry
                                ref={(geometry) => {
                                  geometry.setFromPoints([new THREE.Vector3()]);
                                }}
                              />
                            </T.Points>
                          </>
                        );
                      }}
                    </For>
                  );
                }}
              </Show>
            )}
          </Show>
        )}
      </Show>
    </>
  ));
  let onPointerDown = () => {
    {
      let trackPtNodeById = trackPtNodeUnderMouseById();
      if (trackPtNodeById !== undefined) {
        setState((s) => { s.selectedTrackPtNodeById = trackPtNodeById; });
        return;
      }
    }
    {
      let addTrackPtNode = addTrackPtNodeUnderMouse();
      if (addTrackPtNode !== undefined) {
        let curve2 = curve();
        if (curve2 === undefined) {
          return;
        }
        let trackPtNodes2 = trackPtNodes();
        if (trackPtNodes2 === undefined) {
          return;
        }
        let idx = addTrackPtNode.insertAtIndex;
        let beforeEntityId = trackPtNodes2[idx].entityId;
        let parentEntityId = modeParams.ecs.ecs.get_field(
          beforeEntityId,
          componentRegistry.Child,
          "parent",
        ) as EntityID;
        let entityId = modeParams.ecs.create_entity();
        let pt = curve2.curve.getPoint(addTrackPtNode.tValue);
        modeParams.ecs.add_component(
          entityId,
          componentRegistry.TrackPathPt,
          {
            px: pt.x,
            py: pt.y,
            pz: pt.z,
            twist: pt.w,
          },
        );
        entityAddChildBeforeChild(
          componentRegistry,
          modeParams.ecs,
          parentEntityId,
          entityId,
          beforeEntityId,
        );
        setState((s) => {
          s.selectedTrackPtNodeById = entityId;
        });
        return;
      }
    }
  };
  return {
    sideForm,
    overlay3d,
    orbitControlsEnabled,
    onPointerDown,
  };
}
