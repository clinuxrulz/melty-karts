import { Accessor, createMemo, createSignal, mapArray, Signal } from "solid-js";
import { applyLocalLabelsAndTooling, ModelNodeSpec, ResolvedModelNode } from "./model-node";
import { modelNodeRegistery } from "./nodes/registry";
import { Lookups } from "./lookups";

export class ModelNodeInterpreter {
  readonly lookups: Lookups;

  constructor(lookups: Lookups) {
    this.lookups = lookups;
  }

  interpret(modelNode: ModelNodeSpec, parent: Accessor<ResolvedModelNode | undefined>, altSelf?: Accessor<ResolvedModelNode | undefined>): Accessor<ResolvedModelNode> {
    return createMemo(() => {
      const nodeType = modelNodeRegistery.findModelNodeTypeForSpec(modelNode);
      if (nodeType !== undefined) {
        let self: Signal<ResolvedModelNode | undefined> | undefined;
        if (altSelf === undefined) {
          self = createSignal<ResolvedModelNode>();
        } else {
          self = undefined;
        }
        let r = nodeType.resolve({ modelNode, lookups: this.lookups, parent, self: self === undefined ? altSelf! : self[0], })();
        if (r !== undefined) {
          let resolvedChildren_ = createMemo(mapArray(
            () => r.children?.() ?? [],
            (childSpec) => this.interpret(childSpec, self === undefined ? altSelf! : self[0]),
          ));
          let resolvedChildren = createMemo(() =>
            resolvedChildren_().map((x) => x())
          );
          let r2 = applyLocalLabelsAndTooling(new ResolvedModelNode({
            stableName: r.stableName,
            components: r.components,
            parent,
            children: r.children,
            resolvedChildren,
            items: r.items,
            localLabel: r.localLabel,
            render: r.render,
            lines: r.lines,
            createLocalLabels: r.createLocalLabels,
            createTooling: r.createTooling,
            allocLabels: r.allocLabels,
            floatingActionButtons: r.floatingActionButtons,
          }));
          if (self !== undefined) {
            self[1](r2);
          }
          return r2;
        }
      }
      return new ResolvedModelNode({
        stableName: modelNode.stableName,
        components: modelNode.components,
        children: createMemo(() => []),
      });
    });
  }
}