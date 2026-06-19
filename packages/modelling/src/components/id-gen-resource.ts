import { ECS, resource_key } from "@oasys/oecs";

export const IdGenResource = resource_key<{
  nextId: number,
}>("IdGen");

export function registerIdGenResource(ecs: ECS) {
  ecs.register_resource(
    IdGenResource,
    {
      nextId: 0,
    }
  );
}
