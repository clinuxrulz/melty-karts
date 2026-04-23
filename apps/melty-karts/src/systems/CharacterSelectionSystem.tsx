import { createSignal, createMemo, type Accessor, type Component, onCleanup, createEffect, untrack, Loading } from "solid-js";
import * as THREE from "three";
import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { System } from "./System";
import { MasterState, RegisteredGameMode, RegisteredMasterState } from "../World";

let meltyLibRef: Accessor<typeof import("../models/melty")> | undefined;
let cubeyLibRef: Accessor<typeof import("../models/cubey")> | undefined;
let solidLogoLibRef: Accessor<typeof import("../models/SolidLogo")> | undefined;

if (typeof window !== "undefined") {
  createMemo(() => {
    let setMelty: (mod: typeof import("../models/melty")) => void;
    [meltyLibRef, setMelty] = createSignal<typeof import("../models/melty")>();
    import("../models/melty").then(setMelty);
  });
  
  createMemo(() => {
    let setCubey: (mod: typeof import("../models/cubey")) => void;
    [cubeyLibRef, setCubey] = createSignal<typeof import("../models/cubey")>();
    import("../models/cubey").then(setCubey);
  });
  
  createMemo(() => {
    let setSolidLogo: (mod: typeof import("../models/SolidLogo")) => void;
    [solidLogoLibRef, setSolidLogo] = createSignal<typeof import("../models/SolidLogo")>();
    import("../models/SolidLogo").then(setSolidLogo);
  });
}

export function getMeltyModel(): Accessor<THREE.Object3D | undefined> {
  return createMemo(() => {
    try {
      let lib = meltyLibRef?.();
      if (lib == undefined) return undefined;
      return lib.createMelty();
    } catch (e: any) {
      if (e?.message?.includes("NotReadyYet")) return undefined;
      throw e;
    }
  });
}

export function getCubeyModel(): Accessor<THREE.Object3D | undefined> {
  return createMemo(() => {
    try {
      let lib = cubeyLibRef?.();
      if (lib == undefined) return undefined;
      return lib.createCubey();
    } catch (e: any) {
      if (e?.message?.includes("NotReadyYet")) return undefined;
      throw e;
    }
  });
}

export function getSolidLogoModel(): Accessor<THREE.Object3D | undefined> {
  return createMemo(() => {
    try {
      let lib = solidLogoLibRef?.();
      if (lib == undefined) return undefined;
      return lib.createSolidLogo();
    } catch (e: any) {
      if (e?.message?.includes("NotReadyYet")) return undefined;
      throw e;
    }
  });
}

export function createCharacterSelectionSystem(ecs: ReactiveECS): System {
  const [selectedCharacter, setSelectedCharacter] = createSignal<0 | 1 | 2>(0);
  const [showSelection, setShowSelection] = createSignal(true);
  const [confirmed, setConfirmed] = createSignal(false);
  const [rotationAngle, setRotationAngle] = createSignal(0.0);

  const onConfirm = () => {
    setConfirmed(true);
    const mode = ecs.resource(RegisteredGameMode).get("mode");
    if (mode === 1) {
      ecs.set_resource(RegisteredMasterState, { masterState: MasterState.MULTIPLAYER_LOBBY });
    } else {
      ecs.set_resource(RegisteredMasterState, { masterState: MasterState.IN_GAME });
    }
  };

  let renderer: THREE.WebGLRenderer | undefined;
  let scene: THREE.Scene | undefined;
  let characterGroup: THREE.Group | undefined;
  let canvasRef: HTMLCanvasElement | undefined;
  let canvasDivRef: HTMLDivElement | undefined;
  let animationFrameId: number | undefined;

  const meltyModel = getMeltyModel();
  const cubeyModel = getCubeyModel();
  const solidLogoModel = getSolidLogoModel();

  const getMelty = () => meltyModel?.();
  const getCubey = () => cubeyModel?.();
  const getSolidLogo = () => solidLogoModel?.();

  const initThreeJS = (canvas: HTMLCanvasElement, div: HTMLDivElement) => {
    canvasRef = canvas;
    canvasDivRef = div;

    let camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.z = 1.5;

    scene = new THREE.Scene();

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    characterGroup = new THREE.Group();
    scene.add(characterGroup);

    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });

    const resizeObserver = new ResizeObserver(() => {
      const rect = div.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      renderer.setSize(rect.width, rect.height);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(div);

    onCleanup(() => resizeObserver.disconnect());

    const updateCharacter = (charIndex: number) => {
      if (!characterGroup) return;
      while (characterGroup.children.length > 0) {
        characterGroup.remove(characterGroup.children[0]);
      }

      let mesh: THREE.Object3D | undefined;
      switch (charIndex) {
        case 0:
          mesh = getMelty();
          break;
        case 1:
          mesh = getCubey();
          break;
        case 2:
          mesh = getSolidLogo();
          break;
      }
      if (mesh) {
        let box = new THREE.Box3();
        box.setFromObject(mesh);
        camera.position.y = 0.5* (box.min.y + box.max.y);
        characterGroup.add(mesh);
      }
    };

    createEffect(
      () => selectedCharacter(),
      (charIndex) => {
        untrack(() => {
          updateCharacter(charIndex);
        });
      }
    );

    updateCharacter(0);

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (characterGroup) {
        characterGroup.rotation.y += 0.01;
      }
      if (renderer && camera && scene) {
        renderer.render(scene, camera);
      }
    };
    animate();
  };

  const cleanup = () => {
    if (animationFrameId !== undefined) {
      cancelAnimationFrame(animationFrameId);
    }
    if (renderer) {
      renderer.dispose();
    }
  };

  onCleanup(cleanup);

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
    let canvasDivEl: HTMLDivElement | undefined;
    let canvasEl: HTMLCanvasElement | undefined;
    let initialized = false;

    const setRefs = (el: HTMLDivElement) => {
      canvasDivEl = el;
    };

    const CanvasWrapper: Component = () => {
      return (
        <div
          ref={setRefs}
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
          <canvas
            ref={(el: HTMLCanvasElement) => {
              if (!initialized && el && canvasDivEl) {
                canvasEl = el;
                initThreeJS(el, canvasDivEl);
                initialized = true;
              }
            }}
            style={{ width: "100%", height: "100%" }}
          />
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
