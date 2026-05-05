import { createSignal, createMemo, type Accessor, type Component, onCleanup, createEffect, untrack, Loading, Switch, Match, Show } from "solid-js";
import { JSX as SolidJSX } from "@solidjs/web";
import * as THREE from "three";
import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { System } from "./System";
import { MasterState, RegisteredGameMode, RegisteredMasterState, RegisteredLocalPlayerConfig } from "../World";
import { Canvas, Entity, useFrame } from "solid-three";

import { T } from "../t";
import Melty from "../models/melty";
import { characterSelectionMusic } from "../Music";

let meltyLibRef: Accessor<typeof import("../models/melty") | undefined> | undefined;
let cubeyLibRef: Accessor<typeof import("../models/cubey") | undefined> | undefined;
let solidLogoLibRef: Accessor<typeof import("../models/SolidLogo") | undefined> | undefined;

if (typeof window !== "undefined") {
  createMemo(() => {
    let setMelty: (mod: typeof import("../models/melty")) => void;
    [meltyLibRef, setMelty] = createSignal<typeof import("../models/melty") | undefined>(undefined);
    import("../models/melty").then(setMelty);
  });

  createMemo(() => {
    let setCubey: (mod: typeof import("../models/cubey")) => void;
    [cubeyLibRef, setCubey] = createSignal<typeof import("../models/cubey") | undefined>(undefined);
    import("../models/cubey").then(setCubey);
  });

  createMemo(() => {
    let setSolidLogo: (mod: typeof import("../models/SolidLogo")) => void;
    [solidLogoLibRef, setSolidLogo] = createSignal<typeof import("../models/SolidLogo") | undefined>(undefined);
    import("../models/SolidLogo").then(setSolidLogo);
  });
}

export function getMeltyModel(): Accessor<THREE.Object3D | undefined> {
  return () => {
    try {
      let lib = meltyLibRef?.();
      if (lib == undefined) return undefined;
      return lib.createMelty();
    } catch (e: any) {
      if (e?.message?.includes("NotReadyYet")) return undefined;
      throw e;
    }
  };
}

export function getCubeyModel(): Accessor<THREE.Object3D | undefined> {
  return () => {
    try {
      let lib = cubeyLibRef?.();
      if (lib == undefined) return undefined;
      return lib.createCubey();
    } catch (e: any) {
      if (e?.message?.includes("NotReadyYet")) return undefined;
      throw e;
    }
  };
}

export function getSolidLogoModel(): Accessor<THREE.Object3D | undefined> {
  return () => {
    try {
      let lib = solidLogoLibRef?.();
      if (lib == undefined) return undefined;
      return lib.createSolidLogo();
    } catch (e: any) {
      if (e?.message?.includes("NotReadyYet")) return undefined;
      throw e;
    }
  };
}

export function createCharacterSelectionSystem(ecs: ReactiveECS): System {
  const [selectedCharacter, setSelectedCharacter] = createSignal<0 | 1 | 2>(0);
  const [showSelection, setShowSelection] = createSignal(true);
  const [confirmed, setConfirmed] = createSignal(false);
  const [rotationAngle, setRotationAngle] = createSignal(0.0);

  {
    characterSelectionMusic.play();
    onCleanup(() => {
      characterSelectionMusic.stop();
    });
  }

  const onConfirm = () => {
    setConfirmed(true);
    ecs.set_resource(RegisteredLocalPlayerConfig, { playerType: selectedCharacter() });
    const mode = ecs.resource(RegisteredGameMode).get("mode");
    if (mode === 1) {
      ecs.set_resource(RegisteredMasterState, { masterState: MasterState.MULTIPLAYER_LOBBY });
    } else {
      ecs.set_resource(RegisteredMasterState, { masterState: MasterState.IN_GAME });
    }
  };

  const cubeyModel = getCubeyModel();
  const solidLogoModel = getSolidLogoModel();

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!showSelection() || confirmed()) return;

    switch (e.code) {
      case "Space":
      case "Enter":
      case "KeyK":
        onConfirm();
        break;
      case "ArrowLeft":
        setSelectedCharacter(prev => ((prev - 1 + 3) % 3) as (0 | 1 | 2));
        break;
      case "ArrowRight":
        setSelectedCharacter(prev => ((prev + 1) % 3) as (0 | 1 | 2));
        break;
    }
  };

  window.addEventListener("keydown", handleKeyDown);

  onCleanup(() => {
    window.removeEventListener("keydown", handleKeyDown);
  });

  const Canvas3DPreview: Component = () => {
    const CanvasWrapper: Component = () => {
      return (
        <div
          style={{
            width: "min(300px, 60vw)",
            height: "min(300px, 60vw)",
            "border-radius": "50%",
            "border": "4px solid",
            "border-color": selectedCharacter() === 1 ? "#00bbff" : selectedCharacter() === 0 ? "#ff0000" : "#518ac8",
            "background": "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
            "margin": "0 auto",
            "position": "relative",
            "box-shadow": "0 0 20px rgba(0, 0, 0, 0.5)",
            "overflow": "hidden",
          }}
        >
          <Canvas
            ref={(ctx) => {
              useFrame((ctx, dt) => {
                setRotationAngle((a) => (a + dt) % 360.0);
              });
            }}
            camera={{ position: [ 0.0, 0.0, 1.5, ], }}
            frameloop="always"
          >
            <T.AmbientLight
              args={[ 0xFFFFFF, 0.6, ]}
            />
            <T.DirectionalLight
              args={[ 0xFFFFFF, 1.0, ]}
              position={[ 5.0, 10.0, 7.0, ]}
            />
            <T.Group
              position={[ 0.0, -0.35, 0.0, ]}
              quaternion={new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationAngle())}
            >
              <Switch>
                <Match when={selectedCharacter() == 0}>
                    <Melty/>
                </Match>
                <Match when={selectedCharacter() == 1}>
                  <Show when={cubeyModel()}>
                    {(model) => (
                      <>{(() => {
                        let model2 = model();
                        return untrack(() => (
                          <Entity from={model2}/>
                        ));
                      })()}</>
                    )}
                  </Show>
                </Match>
                <Match when={selectedCharacter() == 2}>
                  <Show when={solidLogoModel()}>
                    {(model) => (
                      <>{(() => {
                        let model2 = model();
                        return untrack(() => (
                          <Entity from={model2}/>
                        ));
                      })()}</>
                    )}
                  </Show>
                </Match>
              </Switch>
            </T.Group>
          </Canvas>
        </div>
      );
    };

    return <CanvasWrapper/>;
  };

  const UI: Component = () => {
    const [clicked, setClicked] = createSignal(false);

    const handlePointerDown = (e: any) => {
      if (e.target.closest(".character-slot") || e.target.closest(".confirm-button")) return;
      setClicked(true);
      setTimeout(() => setClicked(false), 100);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") {
        handlePointerDown(e);
      }
    };

    return (
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          "text-align": "center",
          color: clicked() ? "#ffff00" : "#ffffff",
          "font-family": "Arial, sans-serif",
          "font-size": "clamp(16px, 4vw, 24px)",
          "text-shadow": "0 0 10px rgba(255, 255, 255, 0.5)",
          "pointer-events": clicked() ? "none" : "auto",
          "width": "100%",
          "max-width": "800px",
          "padding": "20px",
          "box-sizing": "border-box",
        }}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        tabindex={0}
      >
        {showSelection() ? (
          <>
            <div style={{ display: "flex", "flex-direction": "column", "align-items": "center", gap: "20px", "margin-bottom": "20px" }}>
              <Loading fallback={<div style={{ color: "white" }}>Loading...</div>}>
                <Canvas3DPreview />
              </Loading>
              <div
                class="confirm-button"
                onClick={(e) => {
                  e.stopPropagation();
                  onConfirm();
                }}
                style={{
                  padding: "10px 30px",
                  "font-size": "clamp(20px, 5vw, 28px)",
                  "font-weight": "bold",
                  "border": "3px solid #00ff00",
                  "border-radius": "10px",
                  "cursor": "pointer",
                  "background": "linear-gradient(135deg, #00ff00, #00cc00)",
                  "color": "#ffffff",
                  "text-shadow": "2px 2px 4px rgba(0, 0, 0, 0.5)",
                  "transition": "all 0.3s ease",
                  "text-transform": "uppercase",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.1)";
                  e.currentTarget.style.boxShadow = "0 0 30px rgba(0, 255, 0, 0.6)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                Confirm
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", "justify-content": "center", "flex-wrap": "wrap" }}>
              <div
                class={`character-slot ${selectedCharacter() === 0 ? "selected" : ""}`}
                style={{
                  padding: "10px",
                  border: "3px solid",
                  "border-color": selectedCharacter() === 0 ? "#ff0000" : "#ffffff",
                  "border-radius": "15px",
                  "cursor": "pointer",
                  width: "110px",
                  height: "110px",
                  display: "flex",
                  "flex-direction": "column",
                  "align-items": "center",
                  "justify-content": "center",
                  "background": "rgba(255, 255, 255, 0.1)",
                  "backdrop-filter": "blur(10px)",
                  "transition": "all 0.3s ease",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedCharacter(0);
                }}
              >
                <div
                  style={{
                    width: "50px",
                    height: "50px",
                    "border-radius": "50%",
                    "background-color": "#ff0000",
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center",
                    "font-size": "10px",
                    "font-weight": "bold",
                    "color": "white",
                    "margin-bottom": "5px",
                    "box-shadow": "0 0 20px rgba(255, 0, 0, 0.5)",
                  }}
                >
                  Melty
                </div>
                <div
                  style={{
                    "font-size": "12px",
                    "font-weight": "bold",
                    "color": "#ffcccc",
                  }}
                >
                  Speed
                </div>
              </div>

              <div
                class={`character-slot ${selectedCharacter() === 1 ? "selected" : ""}`}
                style={{
                  padding: "10px",
                  border: "3px solid",
                  "border-color": selectedCharacter() === 1 ? "#00bbff" : "#ffffff",
                  "border-radius": "15px",
                  "cursor": "pointer",
                  width: "110px",
                  height: "110px",
                  display: "flex",
                  "flex-direction": "column",
                  "align-items": "center",
                  "justify-content": "center",
                  "background": "rgba(255, 255, 255, 0.1)",
                  "backdrop-filter": "blur(10px)",
                  "transition": "all 0.3s ease",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedCharacter(1);
                }}
              >
                <div
                  style={{
                    width: "50px",
                    height: "50px",
                    "border-radius": "50%",
                    "background-color": "#00bbff",
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center",
                    "font-size": "10px",
                    "font-weight": "bold",
                    "color": "white",
                    "margin-bottom": "5px",
                    "box-shadow": "0 0 20px rgba(0, 187, 255, 0.5)",
                  }}
                >
                  Cubey
                </div>
                <div
                  style={{
                    "font-size": "12px",
                    "font-weight": "bold",
                    "color": "#ccf0ff",
                  }}
                >
                  Balanced
                </div>
              </div>

              <div
                class={`character-slot ${selectedCharacter() === 2 ? "selected" : ""}`}
                style={{
                  padding: "10px",
                  border: "3px solid",
                  "border-color": selectedCharacter() === 2 ? "#518ac8" : "#ffffff",
                  "border-radius": "15px",
                  "cursor": "pointer",
                  width: "110px",
                  height: "110px",
                  display: "flex",
                  "flex-direction": "column",
                  "align-items": "center",
                  "justify-content": "center",
                  "background": "rgba(255, 255, 255, 0.1)",
                  "backdrop-filter": "blur(10px)",
                  "transition": "all 0.3s ease",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedCharacter(2);
                }}
              >
                <div
                  style={{
                    width: "50px",
                    height: "50px",
                    "border-radius": "50%",
                    "background-color": "#518ac8",
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center",
                    "font-size": "10px",
                    "font-weight": "bold",
                    "color": "white",
                    "margin-bottom": "5px",
                    "box-shadow": "0 0 20px rgba(81, 138, 200, 0.5)",
                  }}
                >
                  Solid
                </div>
                <div
                  style={{
                    "font-size": "12px",
                    "font-weight": "bold",
                    "color": "#cce8ff",
                  }}
                >
                  Handling
                </div>
              </div>
            </div>

            <div style={{ "margin-top": "20px", "font-size": "clamp(14px, 3.5vw, 18px)", "color": "#cccccc" }}>
              Tap to select, then <strong>Confirm</strong> to race
            </div>
          </>
        ) : (
          <div>
            <div style={{ "margin-bottom": "20px", "font-size": "28px" }}>Press any key or tap to continue</div>
          </div>
        )}
      </div>
    );
  };

  return {
    ui: () => UI,
  };
}
