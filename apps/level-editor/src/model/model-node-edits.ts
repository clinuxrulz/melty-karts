import { ReactiveMap } from "@solid-primitives/map"
import { ReactiveSet } from "@solid-primitives/set";
import { EcsComponentData, EcsComponentPartialData, EcsComponentType, IsEcsComponentData, IsEcsComponentPartialData } from "online-quote-ecs";
import { Accessor, createMemo, createSignal, mapArray, untrack } from "solid-js";
import { ModelNodeSpec, ResolvedModelNode } from "./model-node";
import { ModelNodeInterpreter } from "./model-node-interpreter";
import { constAccessor } from "../util";

export class ModelNodeEdits {
  readonly children = new ReactiveMap<string,ModelNodeEditNode>();

  applyEdits(interpreter: ModelNodeInterpreter, modelNode: ModelNodeSpec): Accessor<ResolvedModelNode | undefined> {
    let result = createMemo(() => {
      let edit = this.children.get(modelNode.stableName);
      if (edit == undefined) {
        return interpreter.interpret(modelNode, constAccessor(undefined));
      }
      return edit.applyEdits(interpreter, modelNode, constAccessor(undefined));
    });
    return createMemo(() => result()());
  }
}

export class ModelNodeEditNode {
  readonly isNodeDeleted = createSignal<boolean>(false);
  readonly changedComponents = new ReactiveMap<string,IsEcsComponentPartialData>();
  readonly deletedComponents = new ReactiveSet<string>();
  readonly addedComponents = createSignal<IsEcsComponentData[]>([]);
  readonly children = new ReactiveMap<string,ModelNodeEditNode>();

  applyEdits(interpreter: ModelNodeInterpreter, modelNode: ModelNodeSpec, parent: Accessor<ResolvedModelNode | undefined>): Accessor<ResolvedModelNode | undefined> {
    return createMemo(() => {
      if (this.isNodeDeleted[0]()) {
        return undefined;
      }

      let components = createMemo(() => {
        let baseComponents = modelNode.components?.() ?? [];
        let result: IsEcsComponentData[] = [];
        let appliedReplacementTypes = new Set<string>();

        for (let component of baseComponents) {
          let componentTypeName = component.type.typeName;
          if (this.deletedComponents.has(componentTypeName)) {
            continue;
          }
          let changedComponent = this.changedComponents.get(componentTypeName);
          if (changedComponent !== undefined) {
            result.push((component.type as EcsComponentType<object>).createData({
              ...(component as EcsComponentData<object>).data,
              ...(changedComponent as EcsComponentPartialData<object>).data,
            }));
            appliedReplacementTypes.add(componentTypeName);
          } else {
            result.push(component);
          }
        }

        for (let [typeName, changedComponent] of this.changedComponents) {
          if (!appliedReplacementTypes.has(typeName) && !this.deletedComponents.has(typeName)) {
            result.push(changedComponent);
          }
        }

        for (let component of this.addedComponents[0]()) {
          if (!this.deletedComponents.has(component.type.typeName)) {
            result.push(component);
          }
        }

        return result;
      });

      let editedNode = new ModelNodeSpec({
        stableName: modelNode.stableName,
        components,
      });

      let [ self, setSelf, ] = createSignal<ResolvedModelNode>();
      let modelWithChildren = interpreter.interpret(editedNode, parent, self);
      let children_ = createMemo(mapArray(
        () => modelWithChildren().children?.() ?? [],
        (child) => {
          let child2 = untrack(child);
          let edit = this.children.get(child2.stableName);
          if (edit == undefined) {
            return interpreter.interpret(child2, self);
          }
          return edit.applyEdits(interpreter, child, self);
        },
      ));
      let children = createMemo(() => children_().flatMap((x) => {
        let x2 = x();
        if (x2 === undefined) {
          return [];
        }
        return [ x2, ];
      }));
      let r = new ResolvedModelNode({
        stableName: modelNode.stableName,
        components,
        parent,
        children: createMemo(() => modelWithChildren().children?.() ?? []),
        resolvedChildren: children,
        render: createMemo(() => modelWithChildren().render?.()),
        lines: createMemo(() => modelWithChildren().lines?.() ?? []),
        floatingActionButtons: createMemo(() => modelWithChildren().floatingActionButtons?.() ?? []),
      });
      setSelf(r);
      return r;
    });
  }
}
