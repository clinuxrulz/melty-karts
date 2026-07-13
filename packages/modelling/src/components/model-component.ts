import { ECS } from "@oasys/oecs";
import { ComponentDefGetDataType, ComponentDefGetSchemaType } from "./util";

export function mkModelComponent(ecs: ECS) {
  return ecs.registerComponent({
    modelId: "u32",
  });
}

export type ModelSchema = ComponentDefGetSchemaType<ReturnType<typeof mkModelComponent>>;
export type ModelState = ComponentDefGetDataType<ReturnType<typeof mkModelComponent>>;
