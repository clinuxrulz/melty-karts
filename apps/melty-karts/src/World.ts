import { ECS, resource_key } from "@oasys/oecs";
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
export const RegisteredMasterState = resource_key<{ masterState: MasterState }>("MasterState");
baseEcs.register_resource(RegisteredMasterState, {
  "masterState": MasterState.INTRO_SCREEN,
});

export const RegisteredTime = resource_key<{ time: number }>("Time");
baseEcs.register_resource(RegisteredTime, { time: 0.0 });

// For Handling the Ready-Steady-Go state at the start of the race
export const enum ReadySteadyGoStage {
  READY = 0,
  STEADY = 1,
  GO = 2,
};

export const RegisteredInGameState = resource_key<{
  isReadySteadyGo: number;
  readySteadyGoStage: ReadySteadyGoStage;
  readySteadyGoCurrentTimeout: number;
}>("InGameState");
baseEcs.register_resource(RegisteredInGameState, {
  isReadySteadyGo: 0,
  readySteadyGoStage: ReadySteadyGoStage.READY,
  readySteadyGoCurrentTimeout: defaultReadySteadyGoConfig.readyBeep.duration,
});

export const RegisteredPreReadySteadyGoDelay = resource_key<{ delay: number }>("PreReadySteadyGoDelay");
baseEcs.register_resource(RegisteredPreReadySteadyGoDelay, {
  delay: 1.0,
});

export const RegisteredPreReadySteadyGoDelayFinished = resource_key<{ value: number }>("PreReadySteadyGoDelayFinished");
baseEcs.register_resource(RegisteredPreReadySteadyGoDelayFinished, {
  value: 0,
});
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

export const RegisteredBanana = baseEcs.register_tag();

export const BOMB_INITIAL_TIMEOUT_UNTIL_EXPLOSION = 5.0;
export const RegisteredBomb = baseEcs.register_component({
  timeoutUntilExplosion: "f32",
});

export const EXPLOSION_INITIAL_TIMEOUT_UNTIL_GONE = 1.0;
export const RegisteredExplosion = baseEcs.register_component({
  timeoutUntilGone: "f32",
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

export const RegisteredKeyBindings = resource_key<{
  upKey: number;
  downKey: number;
  leftKey: number;
  rightKey: number;
  actionKey: number;
  driftKey: number;
  useItemKey: number;
}>("KeyBindings");
baseEcs.register_resource(RegisteredKeyBindings, {
  upKey: readStoredKeyBinding("upKey", "ArrowUp"),
  downKey: readStoredKeyBinding("downKey", "ArrowDown"),
  leftKey: readStoredKeyBinding("leftKey", "ArrowLeft"),
  rightKey: readStoredKeyBinding("rightKey", "ArrowRight"),
  actionKey: readStoredKeyBinding("actionKey", " "),
  driftKey: readStoredKeyBinding("driftKey", "z"),
  useItemKey: readStoredKeyBinding("useItemKey", "Enter"),
});

export const RegisteredGlobalGravity = resource_key<{ x: number; y: number; z: number }>("GlobalGravity");
baseEcs.register_resource(RegisteredGlobalGravity, GlobalGravity.schema);

export const RegisteredSoundEnabled = resource_key<{ enabled: number }>("SoundEnabled");
baseEcs.register_resource(RegisteredSoundEnabled, { enabled: 1 });

export const RegisteredOrbitEnabled = resource_key<{ enabled: number }>("OrbitEnabled");
baseEcs.register_resource(RegisteredOrbitEnabled, { enabled: 0 });

export const RegisteredGameMode = resource_key<{ mode: number }>("GameMode");
baseEcs.register_resource(RegisteredGameMode, { mode: 0 });

export const RegisteredLocalPlayerConfig = resource_key<{ playerType: PlayerTypeEnum }>("LocalPlayerConfig");
baseEcs.register_resource(RegisteredLocalPlayerConfig, { playerType: 0 as PlayerTypeEnum });

export const RegisteredKeyboardInput = resource_key<{
  upDown: number;
  downDown: number;
  leftDown: number;
  rightDown: number;
  actionDown: number;
  driftDown: number;
  useItemDown: number;
}>("KeyboardInput");
baseEcs.register_resource(RegisteredKeyboardInput, {
  upDown: 0,
  downDown: 0,
  leftDown: 0,
  rightDown: 0,
  actionDown: 0,
  driftDown: 0,
  useItemDown: 0,
});

export const RegisteredJoystickInput = resource_key<{ joystickX: number; joystickY: number }>("JoystickInput");
baseEcs.register_resource(RegisteredJoystickInput, {
  joystickX: 0.0,
  joystickY: 0.0,
});

export const MAX_LAPS = 3;

export const RegisteredRaceResults = resource_key<{ finished: number }>("RaceResults");
baseEcs.register_resource(RegisteredRaceResults, {
  finished: 0, // 0: in progress, 1: results ready
});

export const RegisteredRaceRankings = resource_key<{
  rank1: number;
  rank2: number;
  rank3: number;
  rank4: number;
  rank5: number;
  rank6: number;
}>("RaceRankings");
baseEcs.register_resource(RegisteredRaceRankings, {
  rank1: -1, // EntityIDs or -1
  rank2: -1,
  rank3: -1,
  rank4: -1,
  rank5: -1,
  rank6: -1,
});

export const RegisteredRng = resource_key<{ seed: number }>("Rng");
baseEcs.register_resource(RegisteredRng, {
  seed: 42,
});

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
