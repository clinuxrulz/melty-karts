import { ECS } from "@oasys/oecs";
import { ComponentDefGetDataType } from "./util";

export function mkSpiralComponent(ecs: ECS) {
  return ecs.registerComponent({
    radius: "f32",
    totalAngle: "f32",
    exitOffset: "f32",
  });
}

export type SpiralState = ComponentDefGetDataType<ReturnType<typeof mkSpiralComponent>>;
