import { Component, createEffect, createMemo, createSignal, For, mapArray, runWithOwner, Show } from "solid-js";
import { Canvas } from "solid-three";
import * as THREE from "three";
import { T } from "./t";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { ECS, EntityID } from "@oasys/oecs";
import { registerComponents } from "./model/components/registry";
import { registerModelNodes } from "./model/nodes/registry";
import { untrack } from "@solidjs/web";
import { ModelNodeInterpreter } from "./model/model-node-interpreter";
import { Lookups } from "./model/lookups";
import { ModelNodeSpec } from "./model/model-node";
import { constAccessor, opToArr } from "./util";
import { entityAddChild } from "./model/components/parent-component";

const App: Component = () => {
  let [ orbitControls, setOrbitControls ] = createSignal<OrbitControls>();
  let baseEcs = new ECS();
  let componentRegistry = registerComponents(baseEcs);
  let modelNodeRegistry = registerModelNodes(componentRegistry);
  let ecs = new ReactiveECS(baseEcs);
  let entityIds = createMemo(
    () => {
      let result: EntityID[] = [];
      let query = ecs.query();
      for (let i = 0; i < query.archetype_count; ++i) {
        let arch = query.archetypes[i];
        for (let j = 0; j < arch.entity_count; ++j) {
          let entityId = arch.entity_ids[j] as EntityID;
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
  );
  let modelNodes_ = createMemo(mapArray(
    entityIds,
    (entityId) => {
      let entityId2 = untrack(entityId);
      return createMemo(() => {
        let modelNodeType = modelNodeRegistry.fineModelNodeTypeForEntityId(ecs, entityId2);
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
  createMemo(() => {
    console.log(modelNodes());
  });
  {
    let e = ecs.create_entity();
    ecs.add_component(e, componentRegistry.Track, { width: 3.0, });
    for (let i = 0; i < 5; ++i) {
      let a = i * 2.0 * Math.PI / 5;
      let ca = Math.cos(a);
      let sa = Math.sin(a);
      let ptX = 10 * ca;
      let ptZ = 10 * sa;
      let tpe = ecs.create_entity();
      ecs.add_component(
        tpe,
        componentRegistry.TrackPathPt,
        {
          px: ptX,
          py: 0.0,
          pz: ptZ,
          twist: 0.0,
        },
      );
      entityAddChild(componentRegistry, ecs, e, tpe);
    }
  }
  return (
    <div
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
          ctx.camera.lookAt(0.0, 0.0, 0.0);
          let orbitControls2 = new OrbitControls(ctx.camera, ctx.canvas);
          runWithOwner(null, () => setOrbitControls(orbitControls2));
        }}
        camera={{ position: [ 5.0, 5.0, 5.0, ] }}
        style={{
          "width": "100%",
          "height": "100%",
        }}
      >
        <T.GridHelper/>
        <For each={modelNodes()}>
          {(modelNode) => (
            <Show when={modelNode().render?.()}>
              {(render) => {
                let Render = untrack(render);
                return (
                  <Render
                    rerender={() => {}}
                  />
                );
              }}
            </Show>
          )}
        </For>
      </Canvas>
    </div>
  );
};

export default App;
