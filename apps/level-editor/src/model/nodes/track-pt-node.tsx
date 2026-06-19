import { constAccessor } from "../../util";
import { ComponentRegistry, TrackPathPtSchema } from "@melty-karts/modelling";
import { ModelNodeRegistry, ModelNodeType } from "../model-node-registry";

export function mkTrackPtNodeType(
  componentRegistry: ComponentRegistry,
  modelNodeRegistry: ModelNodeRegistry,
): ModelNodeType<TrackPathPtSchema> {
  return {
    typeName: "TrackPathPt",
    componentType: componentRegistry.TrackPathPt,
    resolve(params) {
      return constAccessor(undefined);
    },
  };
}
