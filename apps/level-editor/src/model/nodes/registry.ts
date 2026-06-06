import { ECS } from "@oasys/oecs";
import { ModelNodeRegistry } from "../model-node-registry";
import { ComponentRegistry } from "../components/registry";

export function mkNodeRegistry(componentRegistry: ComponentRegistry): ModelNodeRegistry {
  let registry = new ModelNodeRegistry();
  return registry;
}
