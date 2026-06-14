import { ECS } from "@oasys/oecs";
import { ModelNodeRegistry } from "../model-node-registry";
import { ComponentRegistry } from "../components/registry";
import { mkTrackNodeType } from "./track-node";
import { mkTrackPtNodeType } from "./track-pt-node";

export function registerModelNodes(componentRegistry: ComponentRegistry): ModelNodeRegistry {
  let registry = new ModelNodeRegistry();
  registry.register(mkTrackPtNodeType(componentRegistry, registry));
  registry.register(mkTrackNodeType(componentRegistry, registry));
  return registry;
}
