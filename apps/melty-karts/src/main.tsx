import { Dynamic, For, render, Show, untrack } from "@solidjs/web";
import { createMasterSystem } from "./systems/MasterSystem";
import { RegisteredGameMode, World } from "./World";
import { System } from "./systems/System";
import { Component, createEffect, createMemo, createSignal } from "solid-js";
import { multiplayerSession } from "./netcode/MultiplayerSession";

function App() {
  let { ecs, } = World();
  let system = createMasterSystem(ecs);
  let isMultiplayer = createMemo(() =>
    ecs.resource(RegisteredGameMode).get("mode") === 1
      && multiplayerSession.isActive
  );
  let update2 = (sys: System, dt: number) => {
    sys.update?.(dt);
    if (sys.subsystems != undefined) {
      for (let subsystem of sys.subsystems()) {
        update2(subsystem, dt);
      }
    }
  };
  let update = (dt: number) => {
    update2(system, dt);
  };
  let lastT = 0.0;
  let update3 = (t: number) => {
    let dt: number;
    if (lastT == 0.0) {
      dt = 1.0 / 60.0;
    } else {
      dt = (t - lastT) / 1000.0;
    }
    lastT = t;
    update(dt);
    if (!isMultiplayer()) {
      requestAnimationFrame(update3);
    }
  };
  createEffect(
    isMultiplayer,
    (isMultiplayer) => {
      if (!isMultiplayer) {
        requestAnimationFrame(update3);
      }
    },
  );
  multiplayerSession.update = update;
  let UI: Component<{ sys: System, }> = (props) => (
    <>
      {untrack(() => props.sys.ui?.())}
      <For
        each={
          props.sys.subsystems?.() ?? []
        }
      >
        {(item) => (<UI sys={item()}/>)}
      </For>
    </>
  );
  let TopLeftOverlayUI: Component<{ sys: System, }> = (props) => (
    <>
      {untrack(() => props.sys?.topLeftOverlayUi?.())}
      <For
        each={
          props.sys.subsystems?.() ?? []
        }
      >
        {(item) => (<TopLeftOverlayUI sys={item()}/>)}
      </For>
    </>
  );
  //
  let [isFullscreen, setIsFullscreen] = createSignal(false);
  document.addEventListener("fullscreenchange", () => {
    setIsFullscreen(!!document.fullscreenElement);
  });
  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
        if (screen.orientation && (screen.orientation as any).lock) {
          await (screen.orientation as any).lock("landscape").catch(() => {
            // Some browsers/devices might reject locking
          });
        }
      } catch (err) {
        console.error("Error attempting to enable full-screen mode:", err);
      }
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        }
      }
    }
  };
  //
  return (
    <div style={{
      "position": "absolute",
      "left": "0",
      "top": "0",
      "bottom": "0",
      "right": "0",
    }}>
      <div style={{ position: "absolute", top: "10px", left: "10px", "z-index": 100 }}>
        <button
          onClick={toggleFullscreen}
          style={{
            background: "rgba(0,0,0,0.5)",
            color: "white",
            border: "1px solid white",
            padding: "4px 8px",
            "border-radius": "4px",
            "margin-bottom": "8px",
            cursor: "pointer",
            "font-family": "sans-serif",
            "font-size": "12px"
          }}
        >
          {isFullscreen() ? "Exit Fullscreen" : "Fullscreen"}
        </button>
        <br/>
        <TopLeftOverlayUI sys={system}/>
      </div>
      <UI sys={system}/>
    </div>
  );
}

const root = document.getElementById("root");
if (root) render(() => <App />, root);
