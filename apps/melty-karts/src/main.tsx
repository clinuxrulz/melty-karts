import { Dynamic, For, render, Show, untrack } from "@solidjs/web";
import { createMasterSystem } from "./systems/MasterSystem";
import { RegisteredGameMode, World } from "./World";
import { System } from "./systems/System";
import { Component, createEffect, createMemo } from "solid-js";
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
  return (<UI sys={system}/>);
}

const root = document.getElementById("root");
if (root) render(() => <App />, root);
