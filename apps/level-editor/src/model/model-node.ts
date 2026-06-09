import { Accessor, Component } from "solid-js";
import * as THREE from "three";
import { findComponentData, ModelNodeRegistry, ModelNodeType } from "./model-node-registry";
import { Operation } from "./operation";
import { IsEcsComponentData } from "./ecs-component-data";
import { createRcMemo } from "./rc-memo";
import { ComponentRegistry } from "./components/registry";
import { ComponentDef, ComponentSchema, EntityID, FieldValues } from "@oasys/oecs";
import { transformGetMatrix } from "./components/transform3d-component";
import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { Command } from "./commands";

/**
 * Used for a named path in the model along with the ecs component that make up
 * the node. It allows for editing parts in a parametric object via a path
 * name and replacement ecs components.
 */
export class ModelNodeSpec {
  readonly stableName: string;
  readonly entityId?: EntityID;
  readonly components?: Accessor<IsEcsComponentData[]>;

  constructor(params: {
    stableName: string,
    entityId?: EntityID,
    components?: Accessor<IsEcsComponentData[]>,
  }) {
    this.stableName = params.stableName;
    this.entityId = params.entityId;
    this.components = params.components;
  }

  findComponentData<S extends ComponentSchema>(ecs: ReactiveECS, componentDef: ComponentDef<S>): FieldValues<S> | undefined {
    if (this.entityId !== undefined) {
      let entity = ecs.entity(this.entityId);
      if (!entity.hasComponent(componentDef)) {
        return undefined;
      }
      return new Proxy(
        {},
        {
          get(target, p, receiver) {
            return entity.getField(componentDef, p as any);
          },
        },
      ) as FieldValues<S>;
    } else {
      return findComponentData(this.components?.() ?? [], componentDef)?.data;
    }
  }
}

export class ResolvedModelNode {
  readonly componentRegistry: ComponentRegistry;
  readonly modelNodeRegistry: ModelNodeRegistry;
  readonly stableName: string;
  readonly components?: Accessor<IsEcsComponentData[]>;
  readonly parent?: Accessor<ResolvedModelNode | undefined>;
  readonly children?: Accessor<ModelNodeSpec[]>;
  readonly resolvedChildren?: Accessor<ResolvedModelNode[]>;
  readonly render?: Accessor<Component<{ ref: (self: THREE.Object3D) => void, rerender: () => void, }> | undefined>;
  readonly lines?: Accessor<{ id: string, line: THREE.Line3, }[]>;
  readonly floatingActionButtons?: Accessor<{ text: Accessor<string>, operation: Accessor<Operation>, }[]>;
  readonly propertiesForm?: Accessor<Component<{ doCommand: (command: Command, addToUndoStack?: boolean, undoDescription?: string) => void, }> | undefined>;

  readonly modelNodeType: Accessor<ModelNodeType<ComponentSchema> | undefined> = createRcMemo(() => {
    return this.modelNodeRegistry.findModelNodeTypeForComponentTypes((this.components?.() ?? []).map((x) => x.def));
  });

  readonly localTransform: Accessor<THREE.Matrix4> = createRcMemo(() => {
    let transform = findComponentData(this.components?.() ?? [], this.componentRegistry.Transform3D)?.data;
    if (transform === undefined) {
      return new THREE.Matrix4();
    }
    return transformGetMatrix(transform, new THREE.Matrix4());
  });

  readonly worldTransform: Accessor<THREE.Matrix4> = createRcMemo(() => {
    let parentTransform = this.parent?.()?.worldTransform();
    if (parentTransform === undefined) {
      return this.localTransform();
    }
    return new THREE.Matrix4().multiplyMatrices(
      parentTransform,
      this.localTransform(),
    );
  });

  stablePath(): string {
    let parent2 = this.parent?.();
    if (parent2 == undefined) {
      return this.stableName;
    }
    return `${parent2.stablePath()}/${this.stableName}`;
  }

  constructor(params: {
    componentRegistry: ComponentRegistry,
    modelNodeRegistry: ModelNodeRegistry,
    stableName: string,
    components?: Accessor<IsEcsComponentData[]>,
    parent?: Accessor<ResolvedModelNode | undefined>,
    children?: Accessor<ModelNodeSpec[]>,
    resolvedChildren?: Accessor<ResolvedModelNode[]>,
    render?: Accessor<Component<{ ref: (self: THREE.Object3D) => void, rerender: () => void, }> | undefined>,
    lines?: Accessor<{ id: string, line: THREE.Line3, }[]>,
    floatingActionButtons?: Accessor<{ text: Accessor<string>, operation: Accessor<Operation>, }[]>,
    propertiesForm?: Accessor<Component<{ doCommand: (command: Command, addToUndoStack?: boolean, undoDescription?: string) => void, }> | undefined>,
  }) {
    this.componentRegistry = params.componentRegistry;
    this.modelNodeRegistry = params.modelNodeRegistry;
    this.stableName = params.stableName;
    this.components = params.components;
    this.parent = params.parent;
    this.children = params.children;
    this.resolvedChildren = params.resolvedChildren;
    this.render = params.render;
    this.lines = params.lines;
    this.floatingActionButtons = params.floatingActionButtons;
    this.propertiesForm = params.propertiesForm;
  }
}
