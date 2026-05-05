import * as THREE from "three";
import { ReactiveECS } from "@melty-karts/reactive-ecs";
import type { EntityID } from "@oasys/oecs";
import { System } from "./System";
import { createEffect, createMemo, createSignal, getOwner, onCleanup, runWithOwner, Show, For, createTrackedEffect } from "solid-js";
import { JSX } from "@solidjs/web";
import { Joystick } from "../Joystick";
import { ActionButton } from "../ActionButton";
import { RegisteredGameMode, RegisteredJoystickInput, RegisteredKeyboardInput, RegisteredNetworkSlot, RegisteredOrbitEnabled, RegisteredOrientation, RegisteredPosition, RegisteredSoundEnabled, RegisteredLocalPlayerConfig, RegisteredPlayerConfig, RegisteredInGameState, ReadySteadyGoStage, RegisteredPreReadySteadyGoDelay, RegisteredPreReadySteadyGoDelayFinished } from "../World";
import { createStartFinishLine, generateTrack, getGroundHeight, TRACK_WIDTH } from "../models/Track";
import { createKart } from "../Kart";
import { createRenderSystem } from "./RenderSystem";
import { createKartPhysicsSystem } from "./KartPhysicsSystem";
import { createAISystem } from "./AISystem";
import { createRaceSystem } from "./RaceSystem";
import { createSoundSystem } from "./SoundSystem";
import { untrack } from "@solidjs/web";
import { createRollbackNetcodeSystem } from "./RollbackNetcodeSystem";
import { multiplayerSession } from "../netcode/MultiplayerSession";
import { createReadySteadyGoSystem } from "./ReadySteadyGoSystem";
import { RegisteredAIControlled, RegisteredRaceStats, RegisteredLocalPlayerPosition, RegisteredRaceRankings, RegisteredRaceResults, MasterState, RegisteredMasterState, MAX_LAPS } from "../World";
import { defaultReadySteadyGoConfig } from "../sounds/ReadySteadyGo";
import { EffectComposer, RenderPass, UnrealBloomPass } from "three/examples/jsm/Addons.js";
import { Canvas } from "solid-three";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { raceMusic } from "../Music";

// Add BVH to THREE
// @ts-ignore
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
// @ts-ignore
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export function createInGameSystem(ecs: ReactiveECS): System {
  let [ canvasDiv, setCanvasDiv, ] = createSignal<HTMLDivElement>();
  //let [ canvas, setCanvas, ] = createSignal<HTMLCanvasElement>();
  let [ canvasSize, setCanvasSize, ] = createSignal<THREE.Vector2>();
  //let [ canvasMounted, setCanvasMounted, ] = createSignal(false);
  createEffect(
    () => [
      canvasDiv(),
    ],
    ([
      canvasDiv,
    ]) => {
      if (canvasDiv == undefined) {
        return;
      }
      let resizeObserver = new ResizeObserver(() => {
        let rect = canvasDiv.getBoundingClientRect();
        setCanvasSize(new THREE.Vector2(rect.width, rect.height));
      });
      resizeObserver.observe(canvasDiv);
      return () => {
        resizeObserver.unobserve(canvasDiv);
        resizeObserver.disconnect();
      };
    },
  );
  let [ renderSystem, setRenderSystem ] = createSignal<System>();
  /*
  createMemo(() => {
    let canvasDiv2 = canvasDiv();
    if (canvasDiv2 == undefined) {
      return;
    }
    let canvas2 = canvas();
    if (canvas2 == undefined) {
      return;
    }
    if (!canvasMounted()) {
      return;
    }
    let { dispose, renderSystem: renderSystem2 } = untrack(() =>
      initScene(
        ecs,
        canvasDiv2,
        canvas2,
        setCanvasSize,
      )
    );
    queueMicrotask(() => setRenderSystem(renderSystem2));
    onCleanup(dispose);
  });
  */
  let soundEnabled = createMemo(() =>
    ecs.resource(RegisteredSoundEnabled).get("enabled") != 0
  );
  let setSoundEnabled = (x: boolean) => {
    ecs.set_resource(
      RegisteredSoundEnabled,
      {
        enabled: x ? 1 : 0,
      },
    )
  };
  let orbitEnabled = createMemo(() =>
    ecs.resource(RegisteredOrbitEnabled).get("enabled") != 0
  );
  let setOrbitEnabled = (x: boolean) => {
    ecs.set_resource(
      RegisteredOrbitEnabled,
      {
        enabled: x ? 1 : 0,
      },
    );
  };
  let updateKeyboardInput = (params: {
    upDown?: boolean,
    downDown?: boolean,
    leftDown?: boolean,
    rightDown?: boolean,
    actionDown?: boolean,
    driftDown?: boolean,
  }) => {
    let s = {
      ...ecs.ecs.resource(RegisteredKeyboardInput),
    };
    if (params.upDown !== undefined) {
      s.upDown = params.upDown ? 1 : 0;
    }
    if (params.downDown !== undefined) {
      s.downDown = params.downDown ? 1 : 0;
    }
    if (params.leftDown !== undefined) {
      s.leftDown = params.leftDown ? 1 : 0;
    }
    if (params.rightDown !== undefined) {
      s.rightDown = params.rightDown ? 1 : 0;
    }
    if (params.actionDown !== undefined) {
      s.actionDown = params.actionDown ? 1 : 0;
    }
    if (params.driftDown !== undefined) {
      s.driftDown = params.driftDown ? 1 : 0;
    }
    ecs.set_resource(RegisteredKeyboardInput, s);
  };
  let keyDownListener = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowUp":
        updateKeyboardInput({
          upDown: true,
        });
        break;
      case "ArrowDown":
        updateKeyboardInput({
          downDown: true,
        });
        break;
      case "ArrowLeft":
        updateKeyboardInput({
          leftDown: true,
        });
        break;
      case "ArrowRight":
        updateKeyboardInput({
          rightDown: true,
        });
        break;
      case " ":
        updateKeyboardInput({
          actionDown: true,
        });
        break;
      case "z":
      case "Z":
        updateKeyboardInput({
          driftDown: true,
        });
        break;
    }
  };
  let keyUpListener = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowUp":
        updateKeyboardInput({
          upDown: false,
        });
        break;
      case "ArrowDown":
        updateKeyboardInput({
          downDown: false,
        });
        break;
      case "ArrowLeft":
        updateKeyboardInput({
          leftDown: false,
        });
        break;
      case "ArrowRight":
        updateKeyboardInput({
          rightDown: false,
        });
        break;
      case " ":
        updateKeyboardInput({
          actionDown: false,
        });
        break;
      case "z":
      case "Z":
        updateKeyboardInput({
          driftDown: false,
        });
        break;
    }
  };
  document.addEventListener("keydown", keyDownListener);
  document.addEventListener("keyup", keyUpListener);
  onCleanup(() => {
    document.removeEventListener("keydown", keyDownListener);
    document.removeEventListener("keyup", keyUpListener);
  });
  //
  let joystickHitAreaSize = 150;
  let joystick = Joystick({
    position: createMemo(() =>
      new THREE.Vector2(
        50.0,
        (canvasSize()?.y ?? 0) - 50 - joystickHitAreaSize,
      )
    ),
    hitAreaSize: joystickHitAreaSize,
    outerRingSize: () => 0.8 * joystickHitAreaSize,
    knobSize: () => 70,
  });
  createEffect(
    joystick.value,
    (joyVal) => {
      ecs.set_resource(RegisteredJoystickInput, {
        joystickX: joyVal.x,
        joystickY: joyVal.y,
      });
    },
  );

  let actionButtonSize = 100;
  let actionButton = ActionButton({
    position: createMemo(() =>
      new THREE.Vector2(
        (canvasSize()?.x ?? 0) - 50 - actionButtonSize,
        (canvasSize()?.y ?? 0) - 50 - actionButtonSize,
      )
    ),
    size: () => actionButtonSize,
  });
  createEffect(
    actionButton.pressed,
    (actionDown) => {
      updateKeyboardInput({
        actionDown,
      });
    },
  );
  //
  let subsystems = createMemo(() => {
    return [
      untrack(() => createReadySteadyGoSystem(ecs)),
      untrack(() => createRaceSystem(ecs)),
    ];
  });
  //

  let ui = createMemo(() => () => (
    <div
      ref={setCanvasDiv}
      style={{
        "position": "absolute",
        "left": "0",
        "top": "0",
        "right": "0",
        "bottom": "0",
      }}
    >
      <Canvas
        ref={(ctx) => {
          let owner = getOwner();
          queueMicrotask(() => {
            let canvasDiv2 = canvasDiv();
            if (canvasDiv2 === undefined) {
              return;
            }
            let {
              dispose,
              renderSystem,
            } = runWithOwner(owner, () => initScene(
              ecs,
              canvasDiv2,
              ctx.scene,
              ctx.canvas,
              ctx.camera as THREE.PerspectiveCamera,
              ctx.gl,
              (size) => {
                /*
                ctx.canvas.width = size.x;
                ctx.canvas.height = size.y;*/
                // No operation
              },
            ));
            runWithOwner(owner, () => {
              onCleanup(() => dispose());
            });
            setRenderSystem(renderSystem);
          });
        }}
        style={{ width: "100%", height: "100%", display: "block", "touch-action": "none" }}
        camera={{ fov: 75.0, }}
        frameloop="never"
      >
        <Show when={renderSystem()?.three?.()}>
          {(three) => (<>{(() => {
            let Three = three();
            return untrack(() => (<Three/>));
          })()}</>)}
        </Show>
      </Canvas>
      {/*
      <canvas
        ref={setCanvas}
        style={{ width: "100%", height: "100%", display: "block", "touch-action": "none" }}
      />*/}
      <joystick.UI/>
      <actionButton.UI/>
      {rankingDisplay()}
      {raceResultsUI()}
    </div>
  ));
  let topLeftOverlayUi = createMemo(() => () =>
    <>
      <label style={{ color: "white", "font-family": "sans-serif", "font-size": "14px" }}>
        <input
          type="checkbox"
          checked={orbitEnabled()}
          onChange={(e) => setOrbitEnabled(e.target.checked)}
        />
        {' '}Orbit Camera
      </label>
      <br/>
      <label style={{ color: "white", "font-family": "sans-serif", "font-size": "14px" }}>
        <input
          type="checkbox"
          checked={soundEnabled()}
          onChange={(e) => setSoundEnabled(e.target.checked)}
        />
        {' '}Sound
      </label>
    </>
  );

  // Helper to get player type name
  const getPlayerTypeName = (playerType: number): string => {
    switch (playerType) {
      case 0: return "Melty";
      case 1: return "Cubey";
      case 2: return "Solid";
      default: return "Unknown";
    }
  };

  // Ranking display in top-right corner
  let rankingDisplay = () => {
    const rankings = createMemo(() => ecs.resource(RegisteredRaceRankings));
    
    const rankEntities = createMemo(() => {
      let rankings2 = rankings();
      
      return [
        { rank: 1, entityId: rankings2.get("rank1") },
        { rank: 2, entityId: rankings2.get("rank2") },
        { rank: 3, entityId: rankings2.get("rank3") },
        { rank: 4, entityId: rankings2.get("rank4") },
        { rank: 5, entityId: rankings2.get("rank5") },
        { rank: 6, entityId: rankings2.get("rank6") },
      ].filter(r => r.entityId !== -1);
    });

    return (
      <div style={{
        position: "absolute",
        top: "10px",
        right: "10px",
        "z-index": 100,
        "pointer-events": "none",
        color: "white",
        "font-family": "sans-serif",
        "font-size": "14px",
      }}>
        <For each={rankEntities()}>
          {(item, index) => {
            const itemId = item();
            const entity = ecs.entity(itemId.entityId as EntityID);
            const hasRaceStats = entity.hasComponent(RegisteredRaceStats);
            const hasLocalPlayer = entity.hasComponent(RegisteredLocalPlayerPosition);
            
            if (!hasRaceStats || !hasLocalPlayer) return null;
            
            const laps = entity.getField(RegisteredRaceStats, "laps");
            const finished = entity.getField(RegisteredRaceStats, "finished");
            const displayLap = Math.min(Math.max(0, laps) + 1, MAX_LAPS);
            
            const rankSuffix = index() === 0 ? "st" : index() === 1 ? "nd" : index() === 2 ? "rd" : "th";
            
            return (
              <div style={{
                "background-color": "rgba(0, 0, 0, 0.6)",
                color: "white",
                padding: "4px 8px",
                "margin-bottom": "4px",
                "border-radius": "4px",
                "font-family": "sans-serif",
                "font-size": "34px",
                "text-align": "right",
              }}>
                {index() + 1}{rankSuffix} ({displayLap}/{MAX_LAPS} laps)
                {finished ? " ✓" : ""}
              </div>
            );
          }}
        </For>
      </div>
    );
  };

  // Race Results UI with slide-in animation
  let raceResultsVisible = createSignal(false);
  let setRaceResultsVisible = raceResultsVisible[1];
  
  createMemo(() => {
    const results = ecs.resource(RegisteredRaceResults);
    if (results.get("finished") === 1) {
      // Delay showing results for dramatic effect
      setTimeout(() => setRaceResultsVisible(true), 1000);
    }
  });

  let raceResultsUI = createMemo(() => {
    const visible = raceResultsVisible[0]();
    const rankings = ecs.resource(RegisteredRaceRankings);
    
    const rankEntities = [
      { rank: 1, entityId: rankings.get("rank1") },
      { rank: 2, entityId: rankings.get("rank2") },
      { rank: 3, entityId: rankings.get("rank3") },
      { rank: 4, entityId: rankings.get("rank4") },
      { rank: 5, entityId: rankings.get("rank5") },
      { rank: 6, entityId: rankings.get("rank6") },
    ].filter(r => r.entityId !== -1);

    return (
      <div style={{
        position: "absolute",
        top: "0",
        right: visible ? "0" : "-450px",
        bottom: "0",
        width: "400px",
        display: "flex",
        "justify-content": "center",
        "align-items": "center",
        "z-index": 200,
        transition: "right 0.5s ease-out",
        "pointer-events": visible ? "auto" : "none",
      }}>
        <div style={{
          "background-color": "rgba(0, 0, 0, 0.7)",
          "backdrop-filter": "blur(10px)",
          color: "white",
          padding: "30px",
          "border-radius": "10px 0 0 10px",
          "min-width": "300px",
          "max-width": "350px",
        }}>
          <h2 style={{
            "text-align": "center",
            "font-family": "sans-serif",
            "margin-top": "0",
            "font-size": "24px",
          }}>
            Race Results
          </h2>
          <For each={rankEntities}>
             {(item, index) => {
               const itemId = item();
               const entity = ecs.entity(itemId.entityId as EntityID);
               const hasLocalPlayer = entity.hasComponent(RegisteredLocalPlayerPosition);
               
               if (!hasLocalPlayer) return null;
               
               const rankSuffix = index() === 0 ? "st" : index() === 1 ? "nd" : index() === 2 ? "rd" : "th";
               
               return (
                 <div style={{
                   "background-color": hasLocalPlayer ? "rgba(255, 215, 0, 0.3)" : "rgba(255, 255, 255, 0.1)",
                   padding: "12px 16px",
                   "margin-bottom": "8px",
                   "border-radius": "6px",
                   "font-family": "sans-serif",
                   "font-size": "18px",
                   opacity: visible ? 1 : 0,
                   transform: visible ? "translateX(0)" : "translateX(50px)",
                   transition: `opacity 0.3s ease-out ${index() * 0.1}s, transform 0.3s ease-out ${index() * 0.1}s`,
                 }}>
                    <span style={{ "font-weight": "bold" }}>
                      {index() + 1}{rankSuffix}
                    </span>
                    {' - You'}
                    {hasLocalPlayer ? " (You)" : ""}
                 </div>
               );
             }}
           </For>
        </div>
      </div>
    );
  });
  //
  queueMicrotask(() => {
    ecs.set_resource(RegisteredPreReadySteadyGoDelayFinished, { value: 0, });
    ecs.set_resource(
      RegisteredPreReadySteadyGoDelay,
      {
        delay: 3.0,
      },
    );
  });
  let musicStarted = false;
  return {
    subsystems,
    ui,
    topLeftOverlayUi,
    update(dt) {
      let delayFinished = ecs.resource(RegisteredPreReadySteadyGoDelayFinished).get("value");
      if (!delayFinished) {
        let delay = ecs.resource(RegisteredPreReadySteadyGoDelay).get("delay");
        delay -= dt;
        if (delay >= 0.0) {
          ecs.set_resource(RegisteredPreReadySteadyGoDelay, { delay, });
        } else {
          ecs.set_resource(RegisteredPreReadySteadyGoDelay, { delay: 0.0, });
          ecs.set_resource(RegisteredPreReadySteadyGoDelayFinished, { value: 1, });
          ecs.set_resource(
            RegisteredInGameState,
            {
              isReadySteadyGo: 1,
              readySteadyGoStage: ReadySteadyGoStage.READY,
              readySteadyGoCurrentTimeout:
                defaultReadySteadyGoConfig.steadyBeep.startTime -
                  defaultReadySteadyGoConfig.readyBeep.startTime,
            }
          );
        }
      }
      // Start music after go
      {
        if (!musicStarted) {
          (() => {
            let preReadySteadyGoFinished = ecs.resource(RegisteredPreReadySteadyGoDelayFinished).get("value");
            if (!preReadySteadyGoFinished) {
              return;
            }
            let isReadySteadyGo = ecs.resource(RegisteredInGameState).get("isReadySteadyGo");
            if (isReadySteadyGo) {
              let isGo = ecs.resource(RegisteredInGameState).get("readySteadyGoStage") == ReadySteadyGoStage.GO;
              if (!isGo) {
                return;
              }
            }
            raceMusic.play();
            musicStarted = true;
          })();
        }
      }
      //
      renderSystem()?.update?.(dt);
    },
  };
}

function initScene(
  ecs: ReactiveECS,
  canvasDiv: HTMLDivElement,
  scene: THREE.Scene,
  canvas: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  setCanvasSize: (x: THREE.Vector2) => void,
) {
  const isMultiplayer = ecs.resource(RegisteredGameMode).get("mode") === 1 && multiplayerSession.isActive;
  let joystickValue = createMemo(() =>
    new THREE.Vector2(
      ecs.resource(RegisteredJoystickInput).get("joystickX"),
      ecs.resource(RegisteredJoystickInput).get("joystickY"),
    ),
  );
  let upDown = createMemo(() =>
    ecs.resource(RegisteredKeyboardInput).get("upDown") != 0
  );
  let downDown = createMemo(() =>
    ecs.resource(RegisteredKeyboardInput).get("downDown") != 0
  );
  let leftDown = createMemo(() =>
    ecs.resource(RegisteredKeyboardInput).get("leftDown") != 0
  );
  let rightDown = createMemo(() =>
    ecs.resource(RegisteredKeyboardInput).get("rightDown") != 0
  );
  let actionDown = createMemo(() =>
    ecs.resource(RegisteredKeyboardInput).get("actionDown") != 0
  );
  let driftDown = createMemo(() =>
    ecs.resource(RegisteredKeyboardInput).get("driftDown") != 0
  );
  let soundEnabled = createMemo(() =>
    ecs.resource(RegisteredSoundEnabled).get("enabled") != 0
  );
  let orbitEnabled = createMemo(() =>
    ecs.resource(RegisteredOrbitEnabled).get("enabled") != 0
  );

  //const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x5ba8c9);
  
  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);
  
  const dir = new THREE.DirectionalLight(0xffffff, 1);
  dir.position.set(20, 50, 20);
  dir.castShadow = true;
  dir.shadow.mapSize.width = 2048;
  dir.shadow.mapSize.height = 2048;
  scene.add(dir);
  
  const { curve, group: trackGroup, } = generateTrack(42);
  trackGroup.position.set(0, 0, 0);
  scene.add(trackGroup);
  
  const startFinishLine = createStartFinishLine(curve, 0);
  scene.add(startFinishLine);
  
  const { mesh: ground, bounds } = createTerrain(curve);
  const halfSize = bounds.size / 2;
  dir.shadow.camera.left = bounds.centerX - halfSize;
  dir.shadow.camera.right = bounds.centerX + halfSize;
  dir.shadow.camera.top = bounds.centerZ + halfSize;
  dir.shadow.camera.bottom = bounds.centerZ - halfSize;
  ground.receiveShadow = true;
  scene.add(ground);
  
  placeProps(curve, scene);
  
  const t = 0.995;
  const startPos = curve.getPointAt(t);
  let kartEntityId: number;
  if (isMultiplayer) {
    kartEntityId = findKartEntityForSlot(ecs, multiplayerSession.getLocalSlot());
  } else {
    const startVel = new THREE.Vector3(0, 0, 0);
    const initialHeight = startPos.y + 0.1;
    startPos.y = initialHeight;
    const localPlayerType = ecs.resource(RegisteredLocalPlayerConfig).get("playerType");
    const playerTypeMap: Record<number, "Melty" | "Cubey" | "Solid"> = {
      0: "Melty",
      1: "Cubey",
      2: "Solid",
    };
    kartEntityId = createKart({
      position: startPos,
      velocity: startVel,
      playerType: playerTypeMap[localPlayerType as keyof typeof playerTypeMap],
      facingForward: true,
      reactiveEcs: ecs,
    });
    ecs.add_component(kartEntityId as EntityID, RegisteredRaceStats, { laps: -1, progress: 0, finished: 0, lastT: t, rank: 0 });
    ecs.add_component(kartEntityId as EntityID, RegisteredLocalPlayerPosition, { rank: 0 });

    // Create AI karts
    const aiCount = 3;
    const aiPlayerTypes: ("Melty" | "Cubey" | "Solid")[] = ["Melty", "Cubey", "Solid"];
    for (let i = 0; i < aiCount; i++) {
      const aiT = (0.99 - (i + 1) * 0.005 + 1) % 1; // Slightly behind player
      const aiStartPos = curve.getPointAt(aiT);
      
      // Add slight horizontal offset so they aren't all in a line
      const tangent = curve.getTangentAt(aiT);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      const horizontalOffset = (i - 1) * 2.0; // Spaced out
      aiStartPos.add(normal.multiplyScalar(horizontalOffset));
      aiStartPos.y += 0.1;

      const aiEntityId = createKart({
        position: aiStartPos,
        velocity: new THREE.Vector3(0, 0, 0),
        playerType: aiPlayerTypes[i % aiPlayerTypes.length],
        facingForward: true,
        reactiveEcs: ecs,
      });

      // Set initial orientation to face the direction of the track (decreasing T)
      const lookDir = tangent.clone().multiplyScalar(-1);
      const lookMat = new THREE.Matrix4().lookAt(
        new THREE.Vector3(0,0,0),
        lookDir,
        new THREE.Vector3(0,1,0)
      );
      const q = new THREE.Quaternion().setFromRotationMatrix(lookMat);
      ecs.set_field(aiEntityId, RegisteredOrientation, "x", q.x);
      ecs.set_field(aiEntityId, RegisteredOrientation, "y", q.y);
      ecs.set_field(aiEntityId, RegisteredOrientation, "z", q.z);
      ecs.set_field(aiEntityId, RegisteredOrientation, "w", q.w);

      ecs.add_component(aiEntityId, RegisteredAIControlled, { targetT: aiT });
      ecs.add_component(aiEntityId, RegisteredRaceStats, { laps: -1, progress: 0, finished: 0, lastT: aiT, rank: 0 });
    }
  }

  //const camera = new THREE.PerspectiveCamera(75, 1.0, 0.1, 1000);

  const renderSystem = createRenderSystem(ecs, scene, camera);
  const { dispose: disposeRender } = renderSystem;
  const turnAmount = createMemo(() => {
    const joyX = joystickValue().x;
    if (Math.abs(joyX) > 0.01) {
      return joyX * 2; // Joystick value is -0.5 to 0.55
    }
    if (leftDown()) return -1;
    if (rightDown()) return 1;
    return 0;
  });

  const physicsSystem = isMultiplayer
    ? undefined
    : createKartPhysicsSystem({
        ecs,
        entityId: kartEntityId as EntityID,
        turnAmount,
        upDown,
        downDown,
        actionDown,
        driftDown,
      });

  const aiSystem = isMultiplayer ? undefined : createAISystem(ecs);

  const { update: updateSound, dispose: disposeSound } = createSoundSystem(ecs, soundEnabled);
  const rollbackSystem = isMultiplayer ? createRollbackNetcodeSystem(ecs) : undefined;

  //const renderer = new THREE.WebGLRenderer({ antialias: true, canvas, });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 
    1.5,  // strength
    0.4,  // radius
    0.4,  // threshold
  );
  const composer = new EffectComposer(renderer);
  const renderScene = new RenderPass(scene, camera);
  composer.addPass(renderScene);
  composer.addPass(bloomPass);

  let orbitYaw = 0;
  let orbitPitch = 0.5;
  let orbitDistance = 5;
  let isDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let lastTouchDist = 0;
  let lastTapTime = 0;

  canvas.addEventListener('pointerdown', (e) => {
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    (canvas as any).setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!isDragging || !orbitEnabled()) return;
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    orbitYaw -= dx * 0.01;
    orbitPitch = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, orbitPitch + dy * 0.01));
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  canvas.addEventListener('pointerup', (e) => {
    isDragging = false;
  });

  canvas.addEventListener('pointercancel', () => { isDragging = false; });

  // Prevent context menu on long press
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Touch events for single finger orbit (more reliable than pointer on mobile)
  let touchDragging = false;
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      touchDragging = true;
      lastMouseX = e.touches[0].clientX;
      lastMouseY = e.touches[0].clientY;
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (!orbitEnabled()) return;
    e.preventDefault();
    if (e.touches.length === 1 && touchDragging) {
      const dx = e.touches[0].clientX - lastMouseX;
      const dy = e.touches[0].clientY - lastMouseY;
      orbitYaw -= dx * 0.01;
      orbitPitch = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, orbitPitch + dy * 0.01));
      lastMouseX = e.touches[0].clientX;
      lastMouseY = e.touches[0].clientY;
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    touchDragging = false;
  });

  // Pinch to zoom (need separate touch events for multi-touch)
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist = Math.sqrt(dx * dx + dy * dy);
    }
  });

  canvas.addEventListener('touchmove', (e) => {
    if (!orbitEnabled() || e.touches.length !== 2) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    orbitDistance = Math.max(1, Math.min(20, orbitDistance - (dist - lastTouchDist) * 0.02));
    lastTouchDist = dist;
  }, { passive: false });

  canvas.addEventListener('wheel', (e) => {
    if (orbitEnabled()) {
      orbitDistance = Math.max(1, Math.min(20, orbitDistance + e.deltaY * 0.01));
    }
  });

  let resizeObserver = new ResizeObserver(() => {
    let rect = canvasDiv.getBoundingClientRect();
    setCanvasSize(new THREE.Vector2(rect.width, rect.height));
    renderer.setSize(rect.width, rect.height);
    composer.setSize(rect.width, rect.height);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    composer.render();
  });
  resizeObserver.observe(canvasDiv);
  onCleanup(() => {
    resizeObserver.unobserve(canvasDiv);
    resizeObserver.disconnect();
  });

  const cameraHeight = 3.0;
  const cameraBehind = 6;

  let smoothYaw = 0;
  let smoothCameraPos = new THREE.Vector3();
  let smoothCameraLookAt = new THREE.Vector3();
  const CAMERA_SMOOTH_SPEED = 12;

  let running = true;
  let lastTime = performance.now();
  let isFirstFrame = true;
  const animate = () => {
    if (!running) return;
    
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    
    // Get kart position
    const posX = ecs.entity(kartEntityId as EntityID).getField(RegisteredPosition, "x");
    const posY = ecs.entity(kartEntityId as EntityID).getField(RegisteredPosition, "y");
    const posZ = ecs.entity(kartEntityId as EntityID).getField(RegisteredPosition, "z");
    const kartPos = new THREE.Vector3(posX, posY, posZ);

    // Calculate yaw from forward vector (more reliable than Euler angles for Y-only rotation)
    const qX = ecs.entity(kartEntityId as EntityID).getField(RegisteredOrientation, "x");
    const qY = ecs.entity(kartEntityId as EntityID).getField(RegisteredOrientation, "y");
    const qZ = ecs.entity(kartEntityId as EntityID).getField(RegisteredOrientation, "z");
    const qW = ecs.entity(kartEntityId as EntityID).getField(RegisteredOrientation, "w");
    const q = new THREE.Quaternion(qX, qY, qZ, qW);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    forward.y = 0; // Project to horizontal plane
    let yaw = 0;
    if (forward.length() > 0.001) {
      forward.normalize();
      // Yaw is the angle in the XZ plane: atan2(x, z)
      yaw = Math.atan2(forward.x, forward.z);
    }
    
    if (!ecs.entity(kartEntityId as EntityID).hasComponent(RegisteredAIControlled)) {
      physicsSystem?.update(dt);
    }
    aiSystem?.update?.(dt);
    updateSound(dt, kartEntityId as EntityID);
    
    // Initialize camera on first frame
    if (isFirstFrame) {
      isFirstFrame = false;
      smoothCameraPos.copy(kartPos);
      smoothCameraLookAt.copy(kartPos);
      
      // Initialize smooth yaw
      smoothYaw = yaw;
    }
    
    if (orbitEnabled()) {
      // Orbit relative to kart's facing direction
      const orbitYawAbsolute = yaw + orbitYaw;
      const target = kartPos;
      camera.position.set(
        target.x + orbitDistance * Math.sin(orbitYawAbsolute) * Math.cos(orbitPitch),
        target.y + orbitDistance * Math.sin(orbitPitch),
        target.z + orbitDistance * Math.cos(orbitYawAbsolute) * Math.cos(orbitPitch)
      );
      camera.lookAt(target);
    } else {
      // Calculate target yaw with smoothing
      let yawDiff = yaw - smoothYaw;
      // Handle angle wrapping
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      smoothYaw += yawDiff * Math.min(1, CAMERA_SMOOTH_SPEED * dt);
      
      // Target camera position behind kart
      const targetOffset = new THREE.Vector3(
        -Math.sin(smoothYaw) * cameraBehind,
        cameraHeight,
        -Math.cos(smoothYaw) * cameraBehind
      );
      const targetPos = kartPos.clone().add(targetOffset);
      
      // Target look-at point slightly ahead of kart
      const targetLookAt = kartPos.clone().add(
        new THREE.Vector3(
          Math.sin(smoothYaw) * 2,
          0.3,
          Math.cos(smoothYaw) * 2
        )
      );
      
      // Smoothly interpolate camera position
      smoothCameraPos.lerp(targetPos, 1 - Math.exp(-CAMERA_SMOOTH_SPEED * dt * 3)); // Faster position smoothing
      smoothCameraLookAt.lerp(targetLookAt, 1 - Math.exp(-CAMERA_SMOOTH_SPEED * dt * 3));
      
      camera.position.copy(smoothCameraPos);
      camera.lookAt(smoothCameraLookAt);
    }

    composer.render();
    requestAnimationFrame(animate);
  };
  animate();
  
  return {
    dispose: () => {
      running = false;
      rollbackSystem?.dispose();
      disposeRender();
      disposeSound();
      renderer.dispose();
    },
    renderSystem,
  };
}

function findKartEntityForSlot(ecs: ReactiveECS, slot: number): number {
  for (const arch of ecs.query(RegisteredNetworkSlot)) {
    const slots = arch.get_column(RegisteredNetworkSlot, "slot") as Uint8Array;
    for (let i = 0; i < arch.entity_count; i++) {
      if (slots[i] === slot) {
        return arch.entity_ids[i] as number;
      }
    }
  }
  throw new Error(`Could not find kart entity for multiplayer slot ${slot}`);
}

function computeWorldBounds(curve: THREE.CatmullRomCurve3, propSpread: number) {
  const points = curve.getSpacedPoints(800);
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const halfWidth = Math.max(maxX - minX, maxZ - minZ) / 2 + propSpread + 5;
  
  return { centerX, centerZ, size: halfWidth * 2 };
}

function createTerrain(curve: THREE.CatmullRomCurve3): { mesh: THREE.Group; bounds: { centerX: number; centerZ: number; size: number } } {
  const bounds = computeWorldBounds(curve, 18);
  const size = bounds.size;
  const globalResolution = 160;
  const chunks = 8;
  const resPerChunk = globalResolution / chunks;
  
  const segments = 800;
  const trackPoints = curve.getSpacedPoints(segments);
  const halfSize = size / 2;

  const terrainGroup = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0x4a7c3f,
    roughness: 0.9,
    flatShading: true,
  });

  for (let cz = 0; cz < chunks; cz++) {
    for (let cx = 0; cx < chunks; cx++) {
      const vertices: number[] = [];
      const indices: number[] = [];
      const uvs: number[] = [];
      
      const xStart = cx * resPerChunk;
      const xEnd = (cx + 1) * resPerChunk;
      const zStart = cz * resPerChunk;
      const zEnd = (cz + 1) * resPerChunk;

      for (let z = zStart; z <= zEnd; z++) {
        for (let x = xStart; x <= xEnd; x++) {
          const worldX = bounds.centerX - halfSize + (x / globalResolution) * size;
          const worldZ = bounds.centerZ - halfSize + (z / globalResolution) * size;
          
          let minDist = Infinity;
          let roadY = 0;
          for (let i = 0; i < segments; i++) {
            const dx = trackPoints[i].x - worldX;
            const dz = trackPoints[i].z - worldZ;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < minDist) {
              minDist = dist;
              roadY = trackPoints[i].y;
            }
          }
          
          const halfWidth = TRACK_WIDTH / 2;
          const blendMargin = 3.0;
          let height = getGroundHeight(worldX, worldZ);
          
          if (minDist <= halfWidth + blendMargin) {
            const roadSurfaceY = roadY - 0.2;
            if (minDist <= halfWidth) {
              height = roadSurfaceY;
            } else {
              const blendFactor = (minDist - halfWidth) / blendMargin;
              const originalHeight = getGroundHeight(worldX, worldZ);
              const interpolatedHeight = (roadSurfaceY * (1 - blendFactor)) + (originalHeight * blendFactor);
              const heightCap = roadSurfaceY + blendFactor * 1.5;
              height = Math.min(interpolatedHeight, heightCap);
            }
          }
          
          vertices.push(worldX, height, worldZ);
          uvs.push(x / globalResolution * 4, z / globalResolution * 4);
        }
      }
      
      const width = xEnd - xStart;
      const height = zEnd - zStart;

      for (let z = 0; z < height; z++) {
        for (let x = 0; x < width; x++) {
          const a = z * (width + 1) + x;
          const b = a + 1;
          const c = (z + 1) * (width + 1) + x;
          const d = c + 1;
          
          indices.push(b, a, d);
          indices.push(c, d, a);
        }
      }
      
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      
      // Compute BVH for the chunk
      // @ts-ignore
      geometry.computeBoundsTree();
      
      const chunkMesh = new THREE.Mesh(geometry, material);
      chunkMesh.receiveShadow = true;
      terrainGroup.add(chunkMesh);
    }
  }
  
  return { mesh: terrainGroup, bounds };
}

function placeProps(curve: THREE.CatmullRomCurve3, scene: THREE.Scene) {
  const treeCount = 160;
  const buildingCount = 50;
  const totalProps = treeCount + buildingCount;

  const rng = (i: number) => {
    const x = Math.sin(i * 7919) * 10000;
    return x - Math.floor(x);
  };

  const treeTrunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 1, 6);
  const treeFoliageGeo = new THREE.ConeGeometry(1, 1, 6);
  const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 });
  const treeFoliageMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.8 });

  const buildingBodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const buildingRoofGeo = new THREE.ConeGeometry(1, 1, 4);
  const buildingBodyMat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
  const buildingRoofMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.8 });
  const buildingColors = [0x8b7765, 0xa08070, 0x9c8c7c, 0x7a6a5a];

  // Temporarily store matrices to count valid props
  const treeData: { matrixTrunk: THREE.Matrix4; matrixFoliage: THREE.Matrix4 }[] = [];
  const buildingData: { matrixBody: THREE.Matrix4; matrixRoof: THREE.Matrix4; color: THREE.Color }[] = [];

  for (let i = 0; i < totalProps; i++) {
    const t = rng(i * 13);
    if (Math.abs(t - 0.5) < 0.22) continue;

    const pos = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const nx = -tangent.z;
    const nz = tangent.x;
    const nLen = Math.sqrt(nx * nx + nz * nz);
    const normalizedNx = nx / nLen;
    const normalizedNz = nz / nLen;

    const side = rng(i * 17) > 0.5 ? 1 : -1;
    const distanceOffset = (TRACK_WIDTH / 2 + 4) + rng(i * 19) * 25;

    const x = pos.x + normalizedNx * distanceOffset * side;
    const z = pos.z + normalizedNz * distanceOffset * side;

    const terrainHeight = getGroundHeight(x, z);
    const halfWidth = TRACK_WIDTH / 2;
    const blendMargin = 6.0;
    let height = terrainHeight;

    if (distanceOffset <= halfWidth + blendMargin) {
      const roadTargetY = pos.y + 0.02;
      const blendFactor = (distanceOffset - halfWidth) / blendMargin;
      const cutHeight = Math.min(terrainHeight, roadTargetY);
      height = cutHeight * (1 - blendFactor) + terrainHeight * blendFactor;
    }

    if (i < treeCount) {
      const treeH = 1.5 + rng(i * 7) * 2;
      
      const trunkM = new THREE.Matrix4().compose(
        new THREE.Vector3(x, height + treeH * 0.2, z),
        new THREE.Quaternion(),
        new THREE.Vector3(1, treeH * 0.4, 1)
      );
      const foliageM = new THREE.Matrix4().compose(
        new THREE.Vector3(x, height + treeH * 0.6, z),
        new THREE.Quaternion(),
        new THREE.Vector3(treeH * 0.4, treeH * 0.7, treeH * 0.4)
      );
      treeData.push({ matrixTrunk: trunkM, matrixFoliage: foliageM });
    } else {
      const w = 1 + rng(i * 3) * 2;
      const h = 1.5 + rng(i * 4) * 3;
      const d = 1 + rng(i * 5) * 2;
      
      let height2 = Math.min(
        height,
        getGroundHeight(x - 0.5 * w, z - 0.5 * d),
        getGroundHeight(x - 0.5 * w, z + 0.5 * d),
        getGroundHeight(x + 0.5 * w, z - 0.5 * d),
        getGroundHeight(x + 0.5 * w, z + 0.5 * d),
      );

      const lookMat = new THREE.Matrix4().lookAt(
        new THREE.Vector3(x, height2, z),
        new THREE.Vector3(pos.x, height, pos.z),
        new THREE.Vector3(0, 1, 0)
      );
      const quat = new THREE.Quaternion().setFromRotationMatrix(lookMat);

      const bodyM = new THREE.Matrix4().compose(
        new THREE.Vector3(x, height2 + h / 2, z),
        quat,
        new THREE.Vector3(w, h, d)
      );

      const roofQuat = quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4));
      const roofM = new THREE.Matrix4().compose(
        new THREE.Vector3(x, height2 + h + h * 0.15, z),
        roofQuat,
        new THREE.Vector3(Math.max(w, d) * 0.7, h * 0.3, Math.max(w, d) * 0.7)
      );

      buildingData.push({
        matrixBody: bodyM,
        matrixRoof: roofM,
        color: new THREE.Color(buildingColors[Math.floor(rng(i * 23) * buildingColors.length)])
      });
    }
  }

  // Create InstancedMeshes
  if (treeData.length > 0) {
    const trunkInstances = new THREE.InstancedMesh(treeTrunkGeo, treeTrunkMat, treeData.length);
    const foliageInstances = new THREE.InstancedMesh(treeFoliageGeo, treeFoliageMat, treeData.length);
    trunkInstances.castShadow = true;
    foliageInstances.castShadow = true;

    treeData.forEach((data, idx) => {
      trunkInstances.setMatrixAt(idx, data.matrixTrunk);
      foliageInstances.setMatrixAt(idx, data.matrixFoliage);
    });
    scene.add(trunkInstances);
    scene.add(foliageInstances);
  }

  if (buildingData.length > 0) {
    const bodyInstances = new THREE.InstancedMesh(buildingBodyGeo, buildingBodyMat, buildingData.length);
    const roofInstances = new THREE.InstancedMesh(buildingRoofGeo, buildingRoofMat, buildingData.length);
    bodyInstances.castShadow = true;
    bodyInstances.receiveShadow = true;
    roofInstances.castShadow = true;

    buildingData.forEach((data, idx) => {
      bodyInstances.setMatrixAt(idx, data.matrixBody);
      bodyInstances.setColorAt(idx, data.color);
      roofInstances.setMatrixAt(idx, data.matrixRoof);
    });
    scene.add(bodyInstances);
    scene.add(roofInstances);
  }
}

function createTree(height: number): THREE.Group {
  // Not used anymore but kept for compatibility if needed
  return new THREE.Group();
}

function createBuilding(width: number, height: number, depth: number): THREE.Group {
  // Not used anymore but kept for compatibility if needed
  return new THREE.Group();
}
