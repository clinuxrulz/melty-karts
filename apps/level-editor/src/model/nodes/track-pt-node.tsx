import { constAccessor } from "../../util";
import { ComponentRegistry } from "../components/registry";
import { TrackPathPtSchema } from "../components/track-path-pt-component";
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
