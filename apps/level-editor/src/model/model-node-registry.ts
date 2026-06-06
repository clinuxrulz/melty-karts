import { Accessor } from "solid-js";
import { EcsComponentData, IsEcsComponentData, IsEcsComponentType } from "./ecs-component-data";
import { ModelNodeSpec, ResolvedModelNode } from "./model-node";
import { Lookups } from "./lookups";
import { ComponentDef, ComponentSchema, EntityID } from "@oasys/oecs";
import { ReactiveECS } from "@melty-karts/reactive-ecs";

export interface ModelNodeType<S extends ComponentSchema> {
  readonly typeName: string;
  readonly componentType: ComponentDef<S>;
  resolve(params: {
    modelNode: ModelNodeSpec,
    lookups: Lookups,
    parent: Accessor<ResolvedModelNode | undefined>,
    self: Accessor<ResolvedModelNode | undefined>,
    ecs: ReactiveECS,
    lookupNode: (entityId: EntityID) => ResolvedModelNode | undefined,
  }): Accessor<ResolvedModelNode | undefined>;
}

export class ModelNodeRegistry {
  readonly modelNodeTypes: ModelNodeType<any>[];
  readonly modelNodeTypeByComponentType: Map<ComponentDef<ComponentSchema>, ModelNodeType<any>>;

  constructor(modelNodeTypes: ModelNodeType<any>[] = []) {
    this.modelNodeTypes = [...modelNodeTypes];
    this.modelNodeTypeByComponentType = new Map(
      modelNodeTypes.map((nodeType) => [nodeType.componentType, nodeType]),
    );
  }

  register<S extends ComponentSchema>(modelNodeType: ModelNodeType<S>) {
    let found = false;
    for (let i = 0; i < this.modelNodeTypes.length; ++i) {
      if (this.modelNodeTypes[i].componentType === modelNodeType.componentType) {
        this.modelNodeTypes[i] = modelNodeType;
        found = true;
        break;
      }
    }

    this.modelNodeTypeByComponentType.set(modelNodeType.componentType, modelNodeType);
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
      const nodeType = this.modelNodeTypeByComponentType.get(component.def);
      if (nodeType !== undefined) {
        return nodeType;
      }
    }
    return undefined;
  }

  findModelNodeTypeForComponentTypes(componentTypes: IsEcsComponentType[]) {
    for (let componentType of componentTypes) {
      const nodeType = this.modelNodeTypeByComponentType.get(componentType);
      if (nodeType !== undefined) {
        return nodeType;
      }
    }
    return undefined;
  }
}

export function findComponentData<S extends ComponentSchema>(
  components: IsEcsComponentData[],
  componentType: ComponentDef<S>,
): EcsComponentData<S> | undefined {
  return components.find(
    (component): component is EcsComponentData<S> => component.def === componentType,
  );
}
