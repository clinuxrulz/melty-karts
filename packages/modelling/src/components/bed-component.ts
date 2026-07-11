import { ECS } from "@oasys/oecs";

export function mkBedComponent(ecs: ECS) {
  return ecs.registerTag();
}
