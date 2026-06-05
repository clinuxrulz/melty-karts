import { Accessor } from "solid-js";
import { EcsComponentData, EcsComponentType, IsEcsComponentData, IsEcsComponentType } from "./ecs-component-data";
import { ModelNodeSpec, ResolvedModelNode } from "./model-node";
import { Lookups } from "./lookups";
import { ComponentSchema } from "@oasys/oecs";

export interface ModelNodeType<S extends object = object> {
  readonly typeName: string;
  readonly componentType: EcsComponentType<S>;
  resolve(params: {
    modelNode: ModelNodeSpec,
    lookups: Lookups,
    parent: Accessor<ResolvedModelNode | undefined>,
    self: Accessor<ResolvedModelNode | undefined>,
  }): Accessor<ResolvedModelNode | undefined>;
}

export class ModelNodeRegistry {
  readonly modelNodeTypes: ModelNodeType<any>[];
  readonly modelNodeTypeByComponentType: Map<string, ModelNodeType<any>>;

  constructor(modelNodeTypes: ModelNodeType<any>[] = []) {
    this.modelNodeTypes = [...modelNodeTypes];
    this.modelNodeTypeByComponentType = new Map(
      modelNodeTypes.map((nodeType) => [nodeType.componentType.typeName, nodeType]),
    );
  }

  register<S extends object>(modelNodeType: ModelNodeType<S>) {
    let found = false;
    for (let i = 0; i < this.modelNodeTypes.length; ++i) {
      if (this.modelNodeTypes[i].componentType.typeName === modelNodeType.componentType.typeName) {
        this.modelNodeTypes[i] = modelNodeType;
        found = true;
        break;
      }
    }

    this.modelNodeTypeByComponentType.set(modelNodeType.componentType.typeName, modelNodeType);
    if (!found) {
      this.modelNodeTypes.push(modelNodeType);
    }
  }

  getModelNodeTypes(): ModelNodeType<any>[] {
    return this.modelNodeTypes;
  }

  findModelNodeTypeForSpec(modelNode: ModelNodeSpec): ModelNodeType<any> | undefined {
    const components = modelNode.components?.() ?? [];
    for (let component of components) {
      const nodeType = this.modelNodeTypeByComponentType.get(component.type.typeName);
      if (nodeType !== undefined) {
        return nodeType;
      }
    }
    return undefined;
  }

  findModelNodeTypeForComponentTypes(componentTypes: IsEcsComponentType[]) {
    for (let componentType of componentTypes) {
      const nodeType = this.modelNodeTypeByComponentType.get(componentType.typeName);
      if (nodeType !== undefined) {
        return nodeType;
      }
    }
    return undefined;
  }
}

export function findComponentData<S extends ComponentSchema>(
  components: IsEcsComponentData[],
  componentType: EcsComponentType<S>,
): EcsComponentData<S> | undefined {
  return components.find(
    (component): component is EcsComponentData<S> => component.type.typeName === componentType.typeName,
  );
}
