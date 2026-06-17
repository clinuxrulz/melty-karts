import { ECS } from "@oasys/oecs";

export function mkLoopDaLoopComponent(ecs: ECS) {
  return ecs.register_component({
    diameter: "f32",
    /**
     * The exit side and distance of the loop-da-loop.
     * - negative value: exit left
     * - positive value: exit right
     */
    exitOffset: "f32",
  });
}
