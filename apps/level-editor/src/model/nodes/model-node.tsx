import { ComponentRegistry, RenderBed } from "@melty-karts/modelling";
import { ModelNodeRegistry, ModelNodeType } from "../model-node-registry";
import { ModelSchema } from "@melty-karts/modelling/src/components/model-component";
import { ResolvedModelNode } from "../model-node";
import { createMemo } from "solid-js";
import { whenDefined } from "../../when";
import { constAccessor } from "../../util";

export function mkModelNodeType(
  componentRegistry: ComponentRegistry,
  modelNodeRegistry: ModelNodeRegistry,
): ModelNodeType<ModelSchema> {
  return {
    typeName: "Prop",
    componentType: componentRegistry.Model,
    resolve(params) {
      let prop = createMemo(() => params.modelNode.findComponentData(params.ecs, componentRegistry.Model));
      return whenDefined(
        prop,
        (prop) => {
          let render = constAccessor(RenderBed);
          let propertiesForm = () => undefined;
          return new ResolvedModelNode({
            componentRegistry,
            modelNodeRegistry,
            stableName: params.modelNode.stableName,
            render,
            propertiesForm,
          });
        },
      )
    },
  };
}