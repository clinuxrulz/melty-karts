import { ECS, resourceKey } from "@oasys/oecs";
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

/**
 * A tag to say an entity is not in use and can be re-used.
 * This is so we do not delete entities involved in rollback netcode, because
 * we can not control what `EntityID` gets returned by `createEntity` for the\
 * case where entities reference other entities to form relations.
 */
export const RegisteredFreeEntity = baseEcs.registerTag();

export const enum MasterState {
  INTRO_SCREEN = 0,
  CHARACTER_SELECTION_SCREEN = 1,
  KEY_BINDINGS = 2,
  MULTIPLAYER_LOBBY = 3,
  LEVEL_SELECTION = 4,
  IN_GAME = 5,
  IN_GAME_V2 = 6,
};
export const RegisteredMasterState = resourceKey<{ masterState: MasterState }>("MasterState");
baseEcs.registerResource(RegisteredMasterState, {
  "masterState": MasterState.INTRO_SCREEN,
});

export const RegisteredTime = resourceKey<{ time: number }>("Time");
baseEcs.registerResource(RegisteredTime, { time: 0.0 });

// For Handling the Ready-Steady-Go state at the start of the race
export const enum ReadySteadyGoStage {
  READY = 0,
  STEADY = 1,
  GO = 2,
};

export const RegisteredInGameState = resourceKey<{
  isReadySteadyGo: number;
  readySteadyGoStage: ReadySteadyGoStage;
  readySteadyGoCurrentTimeout: number;
}>("InGameState");
baseEcs.registerResource(RegisteredInGameState, {
  isReadySteadyGo: 0,
  readySteadyGoStage: ReadySteadyGoStage.READY,
  readySteadyGoCurrentTimeout: defaultReadySteadyGoConfig.readyBeep.duration,
});

export const RegisteredPreReadySteadyGoDelay = resourceKey<{ delay: number }>("PreReadySteadyGoDelay");
baseEcs.registerResource(RegisteredPreReadySteadyGoDelay, {
  delay: 1.0,
});

export const RegisteredPreReadySteadyGoDelayFinished = resourceKey<{ value: number }>("PreReadySteadyGoDelayFinished");
baseEcs.registerResource(RegisteredPreReadySteadyGoDelayFinished, {
  value: 0,
});
//

export const RegisteredPosition = baseEcs.registerComponent(Position.def);
export const RegisteredVelocity = baseEcs.registerComponent(Velocity.def);
export const RegisteredOrientation = baseEcs.registerComponent(Orientation.def);
export const RegisteredPlayerConfig = baseEcs.registerComponent(PlayerConfig.def);
export const RegisteredInputControlled = baseEcs.registerComponent(InputControlled.def);
export const RegisteredAIControlled = baseEcs.registerComponent(AIControlled.def);
export const RegisteredRenderable = baseEcs.registerComponent(Renderable.def);
export const RegisteredKartConfig = baseEcs.registerComponent(KartConfig.def);
export const RegisteredKartRuntime = baseEcs.registerComponent(KartRuntime.def);
export const RegisteredNetworkSlot = baseEcs.registerComponent(NetworkSlot.def);
export const RegisteredRaceStats = baseEcs.registerComponent(RaceStats.def);
export const RegisteredLocalPlayerPosition = baseEcs.registerComponent(LocalPlayerPosition.def);

export enum ObsticleType {
  Banana = 0,
  Rock = 1,
}
export const RegisteredObsticle = baseEcs.registerComponent({
  type: "u32"
});

export const MYSTERY_BOX_RESPAWN_TIMEOUT = 5.0;
export const RegisteredMysteryBox = baseEcs.registerComponent({
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
export const RegisteredSlotMachine = baseEcs.registerComponent({
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

export const RegisteredHasCarriedItems = baseEcs.registerComponent({
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

export const RegisteredCarriedItem = baseEcs.registerComponent({
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

export const RegisteredBanana = baseEcs.registerTag();

export const BOMB_INITIAL_TIMEOUT_UNTIL_EXPLOSION = 5.0;
export const RegisteredBomb = baseEcs.registerComponent({
  timeoutUntilExplosion: "f32",
});

export const EXPLOSION_INITIAL_TIMEOUT_UNTIL_GONE = 1.0;
export const RegisteredExplosion = baseEcs.registerComponent({
  timeoutUntilGone: "f32",
});

export const Projectile = baseEcs.registerTag();

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

export const RegisteredKeyBindings = resourceKey<{
  upKey: number;
  downKey: number;
  leftKey: number;
  rightKey: number;
  actionKey: number;
  driftKey: number;
  useItemKey: number;
}>("KeyBindings");
baseEcs.registerResource(RegisteredKeyBindings, {
  upKey: readStoredKeyBinding("upKey", "ArrowUp"),
  downKey: readStoredKeyBinding("downKey", "ArrowDown"),
  leftKey: readStoredKeyBinding("leftKey", "ArrowLeft"),
  rightKey: readStoredKeyBinding("rightKey", "ArrowRight"),
  actionKey: readStoredKeyBinding("actionKey", " "),
  driftKey: readStoredKeyBinding("driftKey", "z"),
  useItemKey: readStoredKeyBinding("useItemKey", "Enter"),
});

export const RegisteredGlobalGravity = resourceKey<{ x: number; y: number; z: number }>("GlobalGravity");
baseEcs.registerResource(RegisteredGlobalGravity, GlobalGravity.schema);

export const RegisteredSoundEnabled = resourceKey<{ enabled: number }>("SoundEnabled");
baseEcs.registerResource(RegisteredSoundEnabled, { enabled: 1 });

export const RegisteredOrbitEnabled = resourceKey<{ enabled: number }>("OrbitEnabled");
baseEcs.registerResource(RegisteredOrbitEnabled, { enabled: 0 });

export const RegisteredGameMode = resourceKey<{ mode: number }>("GameMode");
baseEcs.registerResource(RegisteredGameMode, { mode: 0 });

export const RegisteredLocalPlayerConfig = resourceKey<{ playerType: PlayerTypeEnum }>("LocalPlayerConfig");
baseEcs.registerResource(RegisteredLocalPlayerConfig, { playerType: 0 as PlayerTypeEnum });

export const RegisteredKeyboardInput = resourceKey<{
  upDown: number;
  downDown: number;
  leftDown: number;
  rightDown: number;
  actionDown: number;
  driftDown: number;
  useItemDown: number;
}>("KeyboardInput");
baseEcs.registerResource(RegisteredKeyboardInput, {
  upDown: 0,
  downDown: 0,
  leftDown: 0,
  rightDown: 0,
  actionDown: 0,
  driftDown: 0,
  useItemDown: 0,
});

export const RegisteredJoystickInput = resourceKey<{ joystickX: number; joystickY: number }>("JoystickInput");
baseEcs.registerResource(RegisteredJoystickInput, {
  joystickX: 0.0,
  joystickY: 0.0,
});

export const MAX_LAPS = 3;

export const RegisteredRaceResults = resourceKey<{ finished: number }>("RaceResults");
baseEcs.registerResource(RegisteredRaceResults, {
  finished: 0, // 0: in progress, 1: results ready
});

export const RegisteredRaceRankings = resourceKey<{
  rank1: number;
  rank2: number;
  rank3: number;
  rank4: number;
  rank5: number;
  rank6: number;
}>("RaceRankings");
baseEcs.registerResource(RegisteredRaceRankings, {
  rank1: -1, // EntityIDs or -1
  rank2: -1,
  rank3: -1,
  rank4: -1,
  rank5: -1,
  rank6: -1,
});

export const RegisteredRng = resourceKey<{ seed: number }>("Rng");
baseEcs.registerResource(RegisteredRng, {
  seed: 42,
});

export function World(): {
  ecs: ReactiveECS,
} {
  baseEcs.startup();
  
  //baseEcs.setResource(RegisteredMasterState, { "masterState": MasterState.IN_GAME, });
  baseEcs.setResource(RegisteredGlobalGravity, { x: 0.0, y: -10.0, z: 0.0 });
  baseEcs.setResource(RegisteredJoystickInput, { joystickX: 0.0, joystickY: 0.0, });
  
  return {
    ecs: reactiveEcs,
  };
}
