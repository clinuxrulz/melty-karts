import { ECS } from "@oasys/oecs";
import { ComponentDefGetDataType } from "./util";

export enum UfoStage {
  CHASING_KART = 0,
  BEAMING_UP_KART = 1,
  MOVING_KART = 2,
  BEAMING_DOWN_KART = 3,
  FLY_OFF = 4,
}

export const UFO_BEAMING_TIMEOUT = 2.0;
export const UFO_FLY_OFF_TIMEOUT = 5.0;

export function mkUfoComponent(ecs: ECS) {
  return ecs.registerComponent({
    /**
     * The current `UfoStage`.
     */
    stage: "u8",
    /**
     * The target entity the UFO will pick up.
     */
    target: "i32",
    /**
     * The timeout remaining for the current stage.
     */
    timeout: "f32",
  });
}

export type UfoState = ComponentDefGetDataType<ReturnType<typeof mkUfoComponent>>;
