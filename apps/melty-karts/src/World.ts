import { ECS, ResourceDef } from "@oasys/oecs";
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
  AIControlled,
  RaceStats,
  LocalPlayerPosition,
} from "./components";
import { defaultReadySteadyGoConfig } from "./sounds/ReadySteadyGo";
import { allocStringId } from "./StringTable";

const baseEcs = new ECS();
const reactiveEcs = new ReactiveECS(baseEcs);

export const enum MasterState {
  INTRO_SCREEN = 0,
  CHARACTER_SELECTION_SCREEN = 1,
  KEY_BINDINGS = 2,
  MULTIPLAYER_LOBBY = 3,
  IN_GAME = 4,
};
export const RegisteredMasterState = baseEcs.register_resource(
  ["masterState"] as const,
  {
    "masterState": MasterState.INTRO_SCREEN,
  }
);

export const RegisteredTime = baseEcs.register_resource(
  [ "time", ] as const,
  { time: 0.0, },
)

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
export const RegisteredAIControlled = baseEcs.register_component(AIControlled.def);
export const RegisteredRenderable = baseEcs.register_component(Renderable.def);
export const RegisteredKartConfig = baseEcs.register_component(KartConfig.def);
export const RegisteredKartRuntime = baseEcs.register_component(KartRuntime.def);
export const RegisteredNetworkSlot = baseEcs.register_component(NetworkSlot.def);
export const RegisteredRaceStats = baseEcs.register_component(RaceStats.def);
export const RegisteredLocalPlayerPosition = baseEcs.register_component(LocalPlayerPosition.def);

export enum ObsticleType {
  Banana = 0,
  Rock = 1,
}
export const RegisteredObsticle = baseEcs.register_component({
  type: "u32"
});

export const MYSTERY_BOX_RESPAWN_TIMEOUT = 5.0;
export const RegisteredMysteryBox = baseEcs.register_component({
  /**
   * Rotation angle about the Y-axis in radians
   */
  "angle": "f32",
  /**
   * Weither the mystery box is spawned.
   * 0 false, 1 true
   */
  "spawned": "u8",
  /**
   * Amount of time until the mystery box respawns if it is not current spawned.
   * (I.E. if it has just been collected.)
   */
  "timeUntilRespawn": "f32",
});

export const SLOT_MACHINE_SPIN_TIMEOUT = 5.0;

export enum SlotMachinePhase {
  Spinning = 0,
  DisplayResult = 1,
};

/**
 * This component gets attached to a player to represent the state of the slot
 * machine after the player collects a mystery box.
 */
export const RegisteredSlotMachine = baseEcs.register_component({
  /**
   * Current phase of the slot machine.
   * See: `SlotMachinePhase`
   */
  "phase": "u8",
  /**
   * The amount of time left for the current phase
   */
  "phaseTimeout": "f32",
  /**
   * The current spin position during spin phase
   */
  "spinningOffset": "f32",
});

export const RegisteredHasCarriedItems = baseEcs.register_component({
  /**
   * Entity ID of the first carried item in the link list
   */
  head: "i32",
  /**
   * Enttiy ID of the last carried item in the link list
   */
  tail: "i32",
  /**
   * The number of items currently being carried
   */
  count: "u32",
});

export enum Item {
  Banananananananana = 0,
  Lightning = 1,
  Bombombomb = 2,
  Bomb = 3,
  Banana = 4,
}

export const RegisteredCarriedItem = baseEcs.register_component({
  /**
   * Entity ID of the owner carrying the item
   */
  owner: "i32",
  /**
   * Current item being carried.
   * See: `Item`.
   * Only certain items are carriable.
   */
  item: "u8",
  /**
   * Entity ID of the previous item in the items carried by owner.
   */
  prev: "i32",
  /**
   * Entity ID of the next item in the items carried by owner.
   */
  next: "i32",
  /**
   * The maximum distance the item is from the owner.
   * It allows for the item to be dragged behind the owner.
   */
  maxDistance: "f32",
});

let localStorageKeyBindings: object | null = null;
{
  let _localStorageKeyBindings = window.localStorage.getItem("melty-karts-key-binding");
  if (_localStorageKeyBindings !== null) {
    try {
      localStorageKeyBindings = JSON.parse(_localStorageKeyBindings);
    } catch (e) {
      console.error(e);
    }
  }
}

function readStoredKeyBinding(
  name:
    | "upKey"
    | "downKey"
    | "leftKey"
    | "rightKey"
    | "actionKey"
    | "driftKey"
    | "useItemKey",
  defaultValue: string): number {
  if (localStorageKeyBindings === null) {
    return allocStringId(defaultValue);
  }
  let value = (localStorageKeyBindings as any)[name];
  if (typeof value !== "string") {
    return allocStringId(defaultValue);
  }
  return allocStringId(value);
}

export const RegisteredKeyBindings = baseEcs.register_resource(
  [
    "upKey",
    "downKey",
    "leftKey",
    "rightKey",
    "actionKey",
    "driftKey",
    "useItemKey",
  ] as const,
  {
    upKey: readStoredKeyBinding("upKey", "ArrowUp"),
    downKey: readStoredKeyBinding("downKey", "ArrowDown"),
    leftKey: readStoredKeyBinding("leftKey", "ArrowLeft"),
    rightKey: readStoredKeyBinding("rightKey", "ArrowRight"),
    actionKey: readStoredKeyBinding("actionKey", " "),
    driftKey: readStoredKeyBinding("driftKey", "z"),
    useItemKey: readStoredKeyBinding("useItemKey", "Enter"),
  },
);

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
    "useItemDown",
  ] as const,
  {
    upDown: 0,
    downDown: 0,
    leftDown: 0,
    rightDown: 0,
    actionDown: 0,
    driftDown: 0,
    useItemDown: 0,
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

export const MAX_LAPS = 3;

export const RegisteredRaceResults = baseEcs.register_resource(
  ["finished"] as const,
  {
    finished: 0, // 0: in progress, 1: results ready
  }
);
export const RegisteredRaceRankings = baseEcs.register_resource(
  ["rank1", "rank2", "rank3", "rank4", "rank5", "rank6"] as const,
  {
    rank1: -1, // EntityIDs or -1
    rank2: -1,
    rank3: -1,
    rank4: -1,
    rank5: -1,
    rank6: -1,
  }
)

export const RegisteredRng = baseEcs.register_resource(
  [ "seed", ] as const,
  {
    seed: 42,
  }
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
