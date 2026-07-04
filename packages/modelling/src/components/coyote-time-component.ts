import { ECS } from "@oasys/oecs";
import { ComponentDefGetDataType } from "./util";

export const COYOTE_TIMEOUT = 0.2;
export function mkCoyoteTimeComponent(ecs: ECS) {
  return ecs.registerComponent({
    timeout: "f32",
  });
}

export type CoyoteTimeState = ComponentDefGetDataType<ReturnType<typeof mkCoyoteTimeComponent>>;
