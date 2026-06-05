import { ECS } from "@oasys/oecs";
import { ModelNodeRegistry } from "../model-node-registry";

export function mkNodeRegistry(ecs: ECS): ModelNodeRegistry {
  let registry = new ModelNodeRegistry();
  return registry;
}
