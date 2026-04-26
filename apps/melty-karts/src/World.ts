import { ECS } from "@oasys/oecs";
import { ReactiveECS } from "@melty-karts/reactive-ecs";
import {
  Position,
  Velocity,
  PlayerConfig,
  InputControlled,
  Renderable,
  KartConfig,
  KartRuntime,
  GlobalGravity,
  Orientation,
  NetworkSlot,
  PlayerTypeEnum,
} from "./components";
import { defaultReadySteadyGoConfig } from "./sounds/ReadySteadyGo";

const baseEcs = new ECS();
const reactiveEcs = new ReactiveECS(baseEcs);

export const enum MasterState {
  INTRO_SCREEN = 0,
  CHARACTER_SELECTION_SCREEN = 1,
  MULTIPLAYER_LOBBY = 2,
  IN_GAME = 3,
};
export const RegisteredMasterState = baseEcs.register_resource(
  ["masterState"] as const,
  {
    "masterState": MasterState.INTRO_SCREEN,
  }
);

// For Handling the Ready-Steady-Go state at the start of the race
export const enum ReadySteadyGoStage {
  READY = 0,
  STEADY = 1,
  GO = 2,
};
export const RegisteredInGameState = baseEcs.register_resource(
  [
    "isReadySteadyGo",
    "readySteadyGoStage",
    "readySteadyGoCurrentTimeout",
  ] as const,
  {
    isReadySteadyGo: 0,
    readySteadyGoStage: ReadySteadyGoStage.READY,
    readySteadyGoCurrentTimeout: defaultReadySteadyGoConfig.readyBeep.duration,
  }
);
export const RegisteredPreReadySteadyGoDelay = baseEcs.register_resource(
  [
    "delay"
  ] as const,
  {
    delay: 1.0,
  }
);
export const RegisteredPreReadySteadyGoDelayFinished = baseEcs.register_resource(
  [
    "value",
  ] as const,
  {
    value: 0,
  }
);
//

export const RegisteredPosition = baseEcs.register_component(Position.def);
export const RegisteredVelocity = baseEcs.register_component(Velocity.def);
export const RegisteredOrientation = baseEcs.register_component(Orientation.def);
export const RegisteredPlayerConfig = baseEcs.register_component(PlayerConfig.def);
export const RegisteredInputControlled = baseEcs.register_component(InputControlled.def);
export const RegisteredRenderable = baseEcs.register_component(Renderable.def);
export const RegisteredKartConfig = baseEcs.register_component(KartConfig.def);
export const RegisteredKartRuntime = baseEcs.register_component(KartRuntime.def);
export const RegisteredNetworkSlot = baseEcs.register_component(NetworkSlot.def);

export enum ObsticleType {
  Banana = 0,
  Rock = 1,
}
export const RegisteredObsticle = baseEcs.register_component({
  type: "u32"
});

export const RegisteredGlobalGravity = baseEcs.register_resource(["x", "y", "z"], GlobalGravity.schema);
export const RegisteredSoundEnabled = baseEcs.register_resource([ "enabled", ] as const, { enabled: 1, });
export const RegisteredOrbitEnabled = baseEcs.register_resource([ "enabled", ] as const, { enabled: 0, });
export const RegisteredGameMode = baseEcs.register_resource([ "mode", ] as const, { mode: 0, });
export const RegisteredLocalPlayerConfig = baseEcs.register_resource([ "playerType", ] as const, { playerType: 0 as PlayerTypeEnum, });
export const RegisteredKeyboardInput = baseEcs.register_resource(
  [
    "upDown",
    "downDown",
    "leftDown",
    "rightDown",
    "actionDown",
    "driftDown",
  ] as const,
  {
    upDown: 0,
    downDown: 0,
    leftDown: 0,
    rightDown: 0,
    actionDown: 0,
    driftDown: 0,
  }
);
export const RegisteredJoystickInput = baseEcs.register_resource(
  [
    "joystickX",
    "joystickY",
  ] as const,
  {
    joystickX: 0.0,
    joystickY: 0.0,
  },
);

export function World(): {
  ecs: ReactiveECS,
} {
  baseEcs.startup();
  
  //baseEcs.set_resource(RegisteredMasterState, { "masterState": MasterState.IN_GAME, });
  baseEcs.set_resource(RegisteredGlobalGravity, { x: 0.0, y: -10.0, z: 0.0 });
  baseEcs.set_resource(RegisteredJoystickInput, { joystickX: 0.0, joystickY: 0.0, });
  
  return {
    ecs: reactiveEcs,
  };
}
