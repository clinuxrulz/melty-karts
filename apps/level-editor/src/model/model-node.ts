import { Accessor } from "solid-js";
import * as THREE from "three";
import { findComponentData, ModelNodeType } from "./ModelNodeRegistry";
import { transform3DComponentType } from "../components/Transform3DComponent";
import { Line3D, Transform3D } from "online-quote-math";
import { modelNodeRegistery } from "./nodes/registry";
import { Operation } from "./operation";
import { IsEcsComponentData } from "./ecs-component-data";
import { createRcMemo } from "./rc-memo";

/**
 * Used for a named path in the model along with the ecs component that make up
 * the node. It allows for editing parts in a parametric object via a path
 * name and replacement ecs components.
 */
export class ModelNodeSpec {
  readonly stableName: string;
  readonly components?: Accessor<IsEcsComponentData[]>;

  constructor(params: {
    stableName: string,
    components?: Accessor<IsEcsComponentData[]>,
  }) {
    this.stableName = params.stableName;
    this.components = params.components;
  }
}

export class ResolvedModelNode {
  readonly stableName: string;
  readonly components?: Accessor<IsEcsComponentData[]>;
  readonly parent?: Accessor<ResolvedModelNode | undefined>;
  readonly children?: Accessor<ModelNodeSpec[]>;
  readonly resolvedChildren?: Accessor<ResolvedModelNode[]>;
  readonly render?: Accessor<((params: { rerender: () => void, }) => (THREE.Object3D | undefined)) | undefined>;
  readonly lines?: Accessor<{ id: string, line: Line3D, }[]>;
  readonly floatingActionButtons?: Accessor<{ text: Accessor<string>, operation: Accessor<Operation>, }[]>;

  readonly modelNodeType: Accessor<ModelNodeType<object> | undefined> = createRcMemo(() => {
    return modelNodeRegistery.findModelNodeTypeForComponentTypes((this.components?.() ?? []).map((x) => x.type));
  });

  readonly localTransform: Accessor<Transform3D> = createRcMemo(() => {
    return findComponentData(this.components?.() ?? [], transform3DComponentType)?.data.transform ?? Transform3D.identity;
  });

  readonly worldTransform: Accessor<Transform3D> = createRcMemo(() => {
    let parentTransform = this.parent?.()?.worldTransform();
    if (parentTransform === undefined) {
      return this.localTransform();
    }
    return parentTransform.fromThisSpace(this.localTransform());
  });

  stablePath(): string {
    let parent2 = this.parent?.();
    if (parent2 == undefined) {
      return this.stableName;
    }
    return `${parent2.stablePath()}/${this.stableName}`;
  }

  constructor(params: {
    stableName: string,
    components?: Accessor<IsEcsComponentData[]>,
    parent?: Accessor<ResolvedModelNode | undefined>,
    children?: Accessor<ModelNodeSpec[]>,
    resolvedChildren?: Accessor<ResolvedModelNode[]>,
    render?: Accessor<((params: { rerender: () => void, }) => (THREE.Object3D | undefined)) | undefined>,
    lines?: Accessor<{ id: string, line: Line3D, }[]>,
    floatingActionButtons?: Accessor<{ text: Accessor<string>, operation: Accessor<Operation>, }[]>,
  }) {
    this.stableName = params.stableName;
    this.components = params.components;
    this.parent = params.parent;
    this.children = params.children;
    this.resolvedChildren = params.resolvedChildren;
    this.render = params.render;
    this.lines = params.lines;
    this.floatingActionButtons = params.floatingActionButtons;
  }
}
