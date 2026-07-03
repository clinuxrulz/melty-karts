import { Component, createEffect, createMemo, createRenderEffect, createSignal, For, mapArray, onCleanup, onSettled, runWithOwner, Show } from "solid-js";
import { Canvas } from "solid-three";
import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import { T } from "./t";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { ECS, EntityID } from "@oasys/oecs";
import { registerComponents } from "@melty-karts/modelling";
import { registerModelNodes } from "./model/nodes/registry";
import { untrack } from "@solidjs/web";
import { ModelNodeInterpreter } from "./model/model-node-interpreter";
import { Lookups } from "./model/lookups";
import { ModelNodeSpec } from "./model/model-node";
import { constAccessor, opToArr } from "./util";
import { Mode, ModeParams } from "./model/mode";
import { createSelectionMode } from "./model/modes/selection-mode";
import { ThreeJsUserData } from "./model/threejs-user-data";
import { Accessor } from "@solidjs/signals";
import { CommandExecutor } from "./model/command-executor";
import { UndoRedoManager } from "./model/undo-redo";
import { Operation } from "./model/operation";
import { createEditTrackPtNodesMode } from "./model/modes/edit-track-pt-nodes-mode";
import { Command } from "./model/commands";
import { loadEcsFromXml, saveEcsToXml } from "@melty-karts/modelling";
import { fileOpen, fileSave } from "browser-fs-access";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// @ts-ignore
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
// @ts-ignore
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const App: Component = () => {
  let [ canvas, setCanvas, ] = createSignal<HTMLCanvasElement>();
  let [ canvasSize, setCanvasSize, ] = createSignal<THREE.Vector2>();
  let [ scene, setScene, ] = createSignal<THREE.Scene>();
  let [ camera, setCamera, ] = createSignal<THREE.Camera>();
  let [ orbitControls, setOrbitControls ] = createSignal<OrbitControls>();
  let [ fileHandle, setFileHandle, ] = createSignal<FileSystemFileHandle>();
  let [ fileName, setFileName, ] = createSignal<string>();
  let [ mousePos, setMousePos, ] = createSignal<THREE.Vector2>();
  let [ mkMode, setMkMode, ] = createSignal<() => Mode>();
  let [ selectedNodesByIdSetAccessor, setSelectedNodesByIdSetAccessor, ] = createSignal<Accessor<Set<string>>>();
  let selectedNodesBiIdSet = createMemo(() => selectedNodesByIdSetAccessor()?.() ?? new Set<string>);
  let baseEcs = new ECS();
  let componentRegistry = registerComponents(baseEcs);
  let modelNodeRegistry = registerModelNodes(componentRegistry);
  let ecs = new ReactiveECS(baseEcs);
  let commandExecutor = new CommandExecutor(componentRegistry, ecs);
  let undoRedoManager = new UndoRedoManager((command) => commandExecutor.performCommand(command));
  let screenPtToWorldRay: (pt: THREE.Vector2) => THREE.Ray | undefined;
  {
    let coords = new THREE.Vector2();
    let raycaster = new THREE.Raycaster();
    screenPtToWorldRay = (pt) => {
      let camera2 = camera();
      if (camera2 === undefined) {
        return undefined;
      }
      let canvasSize2 = canvasSize();
      if (canvasSize2 === undefined) {
        return undefined;
      }
      coords.set(
        (pt.x / canvasSize2.x) * 2.0 - 1.0,
        -(pt.y / canvasSize2.y) * 2.0 + 1.0,
      );
      raycaster.setFromCamera(coords, camera2);
      return new THREE.Ray().copy(raycaster.ray);
    };
  }
  let projectWorldPtToScreen: (pt: THREE.Vector3) => THREE.Vector2 | undefined;
  {
    let tmpPt = new THREE.Vector3();
    projectWorldPtToScreen = (pt) => {
      let camera2 = camera();
      if (camera2 === undefined) {
        return undefined;
      }
      let canvasSize2 = canvasSize();
      if (canvasSize2 === undefined) {
        return undefined;
      }
      camera2.updateMatrixWorld();
      tmpPt.copy(pt);
      tmpPt.project(camera2);
      return new THREE.Vector2(
        (tmpPt.x + 1.0) * canvasSize2.width / 2.0,
        (-tmpPt.y + 1.0) * canvasSize2.height / 2.0,
      );
    };
  }
  let mouseRay = createMemo(() => {
    let mousePos2 = mousePos();
    if (mousePos2 === undefined) {
      return undefined;
    }
    return screenPtToWorldRay(mousePos2);
  });
  let entityIds = createMemo(
    () => {
      let result: EntityID[] = [];
      let query = ecs.query();
      for (let i = 0; i < query.archetypeCount; ++i) {
        let arch = query.archetypes[i];
        for (let j = 0; j < arch.entityCount; ++j) {
          let entityId = arch.entityIds[j] as EntityID;
          result.push(entityId);
        }
      }
      return result;
    },
    {
      equals(prev, next) {
        if (next.length !== prev.length) {
          return false;
        }
        for (let i = 0; i < next.length; ++i) {
          if (next[i] !== prev[i]) {
            return false;
          }
        }
        return true;
      },
    },
  );
  let modelNodeInterpreter = new ModelNodeInterpreter(
    componentRegistry,
    modelNodeRegistry,
    {} satisfies Lookups,
    ecs,
    selectedNodesBiIdSet,
  );
  let modelNodes_ = createMemo(mapArray(
    entityIds,
    (entityId) => {
      let entityId2 = untrack(entityId);
      return createMemo(() => {
        let modelNodeType = modelNodeRegistry.findModelNodeTypeForEntityId(ecs, entityId2);
        if (modelNodeType == undefined) {
          return undefined;
        }
        return modelNodeInterpreter.interpret(
          new ModelNodeSpec({
            stableName: `${entityId2}`,
            entityId: entityId2,
          }),
          constAccessor(undefined)
        );
      });
    },
  ));
  let modelNodes = createMemo(() => modelNodes_().flatMap((x) => opToArr(x()?.())));
  let idToModelNodeMap = createMemo(() => new Map(modelNodes().map((x) => [ x.stablePath(), x ] as const)));
  createMemo(() => {
    console.log(modelNodes());
  });
  {
    let initCommand =
      Command.createEntity(
        (e) => Command.seq([
          Command.addComponent(
            e,
            componentRegistry.Track,
            { width: 6.0, },
          ),
          ...Array(5).fill(undefined).map((_, i) => {
            let a = i * 2.0 * Math.PI / 5;
            let ca = Math.cos(a);
            let sa = Math.sin(a);
            let ptX = 10 * ca;
            let ptZ = 10 * sa;
            return Command.createEntity((tpe) =>
              Command.seq([
                Command.addComponent(
                  tpe,
                  componentRegistry.TrackPathPt,
                  {
                    px: ptX,
                    py: 0.0,
                    pz: ptZ,
                    twist: 0.0,
                  },
                ),
                Command.addChild(e, tpe),
              ])
            );
          })
        ]),
      );
    commandExecutor.performCommand(initCommand);
  }
  let setMode = (mkMode: () => Mode) => {
    setMkMode(() => mkMode);
  };
  let doOperation = (operation: Operation) => {
    switch (operation.type) {
      case "editTrackNodes": {
        setMode(() => createEditTrackPtNodesMode({
          modeParams,
          trackId: operation.trackId,
        }))
        break;
      }
      default:
        let x: never = operation.type;
        throw new Error(`Unreachable ${x}`);
    }
  };
  let modeParams: ModeParams = {
    undoManager: undoRedoManager,
    ecs,
    componentRegistry,
    canvas,
    threeScene: scene,
    threeCamera: camera,
    mousePos,
    mouseRay,
    screenPtToWorldRay,
    projectWorldPtToScreen,
    idToModelNodeMap,
    doOperation,
    doCommand(command, addToUndoStack, undoDescription) {
      if (addToUndoStack) {
        undoRedoManager.pushUndo({ command: commandExecutor.performCommand(command), description: undoDescription ?? "", });
        undoRedoManager.clearRedo();
      } else {
        commandExecutor.performCommand(command);
      }
    },
    endMode: () => {
      setMkMode(undefined);
    },
  };
  let mode = createMemo(() => {
    let mkMode2 = mkMode();
    if (mkMode2 === undefined) {
      return untrack(() => createSelectionMode(modeParams));
    } else {
      return untrack(() => mkMode2());
    }
  });
  let Instructions: Component = () => (
    <Show when={mode().instructions?.()}>
      {(instructions) => (<>{(() => {
        let Instructions = instructions();
        return untrack(() => <Instructions/>);
      })()}</>)}
    </Show>
  );
  let sideForm: Accessor<Component | undefined> = createMemo(() => mode().sideForm?.());
  {
    let selectedNodesByIdSet_ = createMemo(() => mode().selectedObjectsByIdSet?.() ?? new Set<string>());
    runWithOwner(null, () => setSelectedNodesByIdSetAccessor(() => selectedNodesByIdSet_));
  }
  let Overlay3d: Component = () => (
    <Show when={mode().overlay3d?.()}>
      {(overlay3d) => (<>{(() => {
        let Overlay3d = overlay3d();
        return untrack(() => <Overlay3d/>);
      })()}</>)}
    </Show>
  );
  let OverlayHtml: Component = () => (
    <Show when={mode().overlayHtml?.()}>
      {(overlayHtml) => (<>{(() => {
        let OverlayHtml = overlayHtml();
        return untrack(() => <OverlayHtml/>);
      })()}</>)}
    </Show>
  );
  let orbitControlsEnabled = createMemo(() => {
    let x = mode().orbitControlsEnabled;
    if (x === undefined) {
      return true;
    }
    return x();
  });
  createRenderEffect(
    orbitControlsEnabled,
    (x) => {
      let orbitControls2 = orbitControls();
      if (orbitControls2 === undefined) {
        return;
      }
      orbitControls2.enabled = x;
    },
  );
  let onPointerDown = (e: PointerEvent) => {
    let canvas2 = canvas();
    if (canvas2 === undefined) {
      return;
    }
    let rect = canvas2.getBoundingClientRect();
    let px = e.clientX - rect.left;
    let py = e.clientY - rect.top;
    setMousePos(new THREE.Vector2(px, py));
    onSettled(() => {
      mode().onPointerDown?.();
    });
  };
  let onPointerUp = (e: PointerEvent) => {
    let canvas2 = canvas();
    if (canvas2 === undefined) {
      return;
    }
    let rect = canvas2.getBoundingClientRect();
    let px = e.clientX - rect.left;
    let py = e.clientY - rect.top;
    setMousePos(new THREE.Vector2(px, py));
    onSettled(() => {
      mode().onPointerUp?.();
    });
  };
  let onPointerMove = (e: PointerEvent) => {
    let canvas2 = canvas();
    if (canvas2 === undefined) {
      return;
    }
    let rect = canvas2.getBoundingClientRect();
    let px = e.clientX - rect.left;
    let py = e.clientY - rect.top;
    setMousePos(new THREE.Vector2(px, py));
  };
  let onPointerLeave = (e: PointerEvent) => {
    setMousePos(undefined);
  };
  return (
    <div
      style={{
        "position": "absolute",
        "left": "0",
        "top": "0",
        "right": "0",
        "bottom": "0",
        "overflow": "hidden",
      }}
    >
      <Canvas
        gl={(canvas) => new WebGPURenderer({ canvas })}
        ref={(ctx) => {
          ctx.camera.lookAt(0.0, 0.0, 0.0);
          let orbitControls2 = new OrbitControls(ctx.camera, ctx.canvas);
          runWithOwner(null, () => {
            setOrbitControls(orbitControls2);
            setCanvas(ctx.canvas);
            setCamera(ctx.camera);
            setScene(ctx.scene);
          });
          ctx.canvas.addEventListener("pointerdown", onPointerDown);
          ctx.canvas.addEventListener("pointerup", onPointerUp);
          ctx.canvas.addEventListener("pointermove", onPointerMove);
          ctx.canvas.addEventListener("pointerleave", onPointerLeave);
          let resizeObserver = new ResizeObserver(() => {
            let rect = ctx.canvas.getBoundingClientRect();
            setCanvasSize(new THREE.Vector2(rect.width, rect.height));
          });
          resizeObserver.observe(ctx.canvas);
          onCleanup(() => {
            resizeObserver.unobserve(ctx.canvas);
            resizeObserver.disconnect();
          });
        }}
        camera={{ position: [ 5.0, 5.0, 5.0, ] }}
        style={{
          "width": "100%",
          "height": "100%",
        }}
      >
        <T.DirectionalLight
          position={[1, 2, 3]}
          intensity={5.0}
        />
        <T.AmbientLight
          intensity={2.0}
        />
        <T.GridHelper/>
        <For each={modelNodes()}>
          {(modelNode) => (
            <Show when={modelNode().render?.()}>
              {(render) => {
                return (<>{(() => {
                  let Render = render();
                  return untrack(() => (
                    <Render
                      ref={(self) => {
                        self.userData = {
                          type: "ThreeJsUserData",
                          modelNodePath: untrack(() => modelNode().stablePath()),
                        } satisfies ThreeJsUserData;
                      }}
                      rerender={() => {}}
                    />
                  ));
                })()}</>);
              }}
            </Show>
          )}
        </For>
        <Overlay3d/>
      </Canvas>
      <div
        class="flex flex-col md:flex-row"
        style={{
          "position": "absolute",
          "left": "0",
          "top": "0",
          "right": "0",
          "bottom": "0",
          "pointer-events": "none",
          "overflow": "hidden",
        }}
      >
        <Show when={sideForm()}>
          {(sideForm) => {
            let SideForm = untrack(sideForm);
            return (
              <div
                class="h-[30%] md:h-auto md:w-1/4"
                style={{
                  "background-color": "rgba(0,0,0,0.5)",
                  "overflow": "hidden",
                }}
              >
                <div style="pointer-events: auto; display: inline-block; height: 100%; overflow: auto;">
                  <SideForm/>
                </div>
              </div>
            );
          }}
        </Show>
        <div style="flex-grow: 1; position: relative;">
          <div
            style={{
              "position": "absolute",
              "left": "0",
              "top": "0",
            }}
          >
            <div style="margin: 5px; background-color: rgba(0, 0, 0, 0.5);">
              <Show when={canvasSize()}>
                {(canvasSize) => (<>Canvas Size: {Math.floor(canvasSize().x)} x {Math.floor(canvasSize().y)}</>)}
              </Show><br/>
              <Show when={mousePos()}>
                {(mousePos) => (<>MousePos: {Math.floor(mousePos().x)} x {Math.floor(mousePos().y)}</>)}
              </Show><br/>
              <Show when={mouseRay()}>
                {(mouseRay) => (
                  <>
                    Mouse Ray Origin: ({mouseRay().origin.x.toFixed(3)}, {mouseRay().origin.y.toFixed(3)}, {mouseRay().origin.z.toFixed(3)})<br/>
                    Mouse Ray Direction: ({mouseRay().direction.x.toFixed(3)}, {mouseRay().direction.y.toFixed(3)}, {mouseRay().direction.z.toFixed(3)})
                  </>
                )}
              </Show><br/>
              <div style={{ "pointer-events": "auto", }}>
                <Instructions/>
              </div>
            </div>
          </div>
          <div
            style={{
              "position": "absolute",
              "top": "5px",
              "right": "5px",
              "pointer-events": "auto",
            }}
          >
            <div
              class="tooltip"
              data-tip={`Undo ${undoRedoManager.undoDescription() ?? ""}`}
            >
              <button
                class="btn btn-primary"
                disabled={!undoRedoManager.hasUndo()}
                onClick={() => undoRedoManager.undo()}
              >
                Undo
              </button>
            </div>
            <div
              class="tooltip"
              data-tip={`Redo ${undoRedoManager.redoDescription() ?? ""}`}
            >
              <button
                class="btn btn-primary ml-1"
                disabled={!undoRedoManager.hasRedo()}
                onClick={() => undoRedoManager.redo()}
              >
                Redo
              </button>
            </div>
            {(() => {
              let name = fileName();
              if (name) {
                return (
                  <span class="ml-2 text-sm text-base-content/70 max-w-40 truncate inline-block align-middle">
                    {name}
                  </span>
                );
              }
            })()}
            <button
              class="btn btn-primary ml-2"
              onClick={async () => {
                let xmlData = saveEcsToXml(
                  componentRegistry,
                  modelNodeRegistry.primaryComponentTypes,
                  ecs,
                );
                let blob = new Blob([ xmlData ], { type: "application/xml", });
                let existingHandle = fileHandle();
                if (existingHandle) {
                  await fileSave(
                    blob,
                    { fileName: "level.melty-karts-level.xml" },
                    existingHandle,
                  );
                } else {
                  await fileSave(blob, {
                    fileName: "level.melty-karts-level.xml",
                    extensions: [".xml"],
                  });
                }
              }}
            >
              Save
            </button>
            <button
              class="btn btn-outline btn-primary ml-1"
              onClick={async () => {
                let xmlData = saveEcsToXml(
                  componentRegistry,
                  modelNodeRegistry.primaryComponentTypes,
                  ecs,
                );
                let blob = new Blob([ xmlData ], { type: "application/xml", });
                await fileSave(blob, {
                  fileName: "level.melty-karts-level.xml",
                  extensions: [".xml"],
                });
              }}
            >
              Save As
            </button>
            {untrack(() => {
              return (
                <button
                  class="btn btn-primary ml-1"
                  onClick={async () => {
                    let blob;
                    try {
                      blob = await fileOpen({
                        extensions: [".xml"],
                        description: "Melty Karts Level",
                      });
                    } catch {
                      return;
                    }
                    let handle = (blob as any).handle as FileSystemFileHandle | undefined;
                    let xmlData = await blob.text();
                    try {
                      loadEcsFromXml(
                        componentRegistry,
                        ecs,
                        xmlData,
                      );
                      undoRedoManager.clear();
                      if (handle) {
                        setFileHandle(handle);
                        setFileName(blob.name || "Untitled");
                      }
                    } catch (e) {
                      console.error(e);
                      alert("Failed to load file.");
                    }
                  }}
                >
                  Load
                </button>
              );
            })}
          </div>
          <OverlayHtml/>
        </div>
      </div>
    </div>
  );
};

export default App;
