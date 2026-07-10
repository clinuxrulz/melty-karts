import { ECS, resourceKey } from "@oasys/oecs";

export const IdGenResource = resourceKey<{
  nextId: number,
}>("IdGen");

export function registerIdGenResource(ecs: ECS) {
  ecs.resources.register(
    IdGenResource,
    {
      nextId: 0,
    }
  );
}
