import { Accessor, createMemo, createSignal, mapArray, Signal, untrack } from "solid-js";
import { ModelNodeSpec, ResolvedModelNode } from "./model-node";
import { Lookups } from "./lookups";
import { ModelNodeRegistry } from "./model-node-registry";
import { ComponentRegistry } from "./components/registry";
import { EntityID } from "@oasys/oecs";
import { ReactiveECS } from "@melty-karts/reactive-ecs";

export class ModelNodeInterpreter {
  readonly componentRegistry: ComponentRegistry;
  readonly modelNodeRegistry: ModelNodeRegistry;
  readonly lookups: Lookups;
  readonly ecs: ReactiveECS;

  constructor(
    componentRegistry: ComponentRegistry,
    modelNodeRegistry: ModelNodeRegistry,
    lookups: Lookups,
    ecs: ReactiveECS,
  ) {
    this.componentRegistry = componentRegistry;
    this.modelNodeRegistry = modelNodeRegistry;
    this.lookups = lookups;
    this.ecs = ecs;
  }

  interpret(modelNode: ModelNodeSpec, parent: Accessor<ResolvedModelNode | undefined>, altSelf?: Accessor<ResolvedModelNode | undefined>): Accessor<ResolvedModelNode> {
    return createMemo(() => {
      const nodeType = this.modelNodeRegistry.findModelNodeTypeForSpec(this.ecs, modelNode);
      if (nodeType !== undefined) {
        let self: Signal<ResolvedModelNode | undefined> | undefined;
        if (altSelf === undefined) {
          self = createSignal<ResolvedModelNode>();
        } else {
          self = undefined;
        }
        let r = nodeType.resolve({ modelNode, lookups: this.lookups, parent, self: self === undefined ? altSelf! : self[0], ecs: this.ecs, })();
        if (r !== undefined) {
          let resolvedChildren_ = createMemo(mapArray(
            () => r.children?.() ?? [],
            (childSpec) => this.interpret(untrack(childSpec), self === undefined ? altSelf! : self[0]),
          ));
          let resolvedChildren = createMemo(() =>
            resolvedChildren_().map((x) => x())
          );
          let r2 = new ResolvedModelNode({
            componentRegistry: this.componentRegistry,
            modelNodeRegistry: this.modelNodeRegistry,
            stableName: r.stableName,
            components: r.components,
            parent,
            children: r.children,
            resolvedChildren,
            render: r.render,
            lines: r.lines,
            floatingActionButtons: r.floatingActionButtons,
          });
          if (self !== undefined) {
            self[1](r2);
          }
          return r2;
        }
      }
      return new ResolvedModelNode({
        componentRegistry: this.componentRegistry,
        modelNodeRegistry: this.modelNodeRegistry,
        stableName: modelNode.stableName,
        components: modelNode.components,
        children: createMemo(() => []),
      });
    });
  }
}
