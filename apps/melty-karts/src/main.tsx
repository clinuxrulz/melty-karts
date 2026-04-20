import { Dynamic, For, render, Show, untrack } from "@solidjs/web";
import { createMasterSystem } from "./systems/MasterSystem";
import { World } from "./World";
import { System } from "./systems/System";
import { Component } from "solid-js";

function App() {
  debugger;
  let { ecs, } = World();
  let system = createMasterSystem(ecs);
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
