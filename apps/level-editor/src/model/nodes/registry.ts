import { ModelNodeRegistry } from "../model-node-registry";
import { ComponentRegistry } from "@melty-karts/modelling";
import { mkTrackNodeType } from "./track-node";
import { mkTrackPtNodeType } from "./track-pt-node";
import { mkModelNodeType } from "./model-node";

export function registerModelNodes(componentRegistry: ComponentRegistry): ModelNodeRegistry {
  let registry = new ModelNodeRegistry();
  registry.register(mkModelNodeType(componentRegistry, registry));
  registry.register(mkTrackPtNodeType(componentRegistry, registry));
  registry.register(mkTrackNodeType(componentRegistry, registry));
  return registry;
}
