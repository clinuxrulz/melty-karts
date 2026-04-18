import { ECS } from "@oasys/oecs";
import { ReactiveECS } from "@melty-karts/reactive-ecs";
import {
  Position,
  Velocity,
  PlayerConfig,
  InputControlled,
  Renderable,
  KartConfig,
  GlobalGravity,
  Orientation,
} from "./components";

const baseEcs = new ECS();
const reactiveEcs = new ReactiveECS(baseEcs);

export const RegisteredPosition = baseEcs.register_component(Position.def);
export const RegisteredVelocity = baseEcs.register_component(Velocity.def);
export const RegisteredOrientation = baseEcs.register_component(Orientation.def);
export const RegisteredPlayerConfig = baseEcs.register_component(PlayerConfig.def);
export const RegisteredInputControlled = baseEcs.register_component(InputControlled.def);
export const RegisteredRenderable = baseEcs.register_component(Renderable.def);
export const RegisteredKartConfig = baseEcs.register_component(KartConfig.def);
export const RegisteredGlobalGravity = baseEcs.register_resource(["x", "y", "z"], GlobalGravity.schema);

export function World(): {
  ecs: ReactiveECS,
} {
  baseEcs.startup();
  
  baseEcs.set_resource(RegisteredGlobalGravity, { x: 0.0, y: -10.0, z: 0.0 });
  
  return {
    ecs: reactiveEcs,
  };
}
