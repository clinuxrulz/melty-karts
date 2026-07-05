import { ReactiveECS } from "@melty-karts/reactive-ecs"
import { System } from "./System";
import { createMemo, createRoot } from "solid-js";
import { MasterState, RegisteredMasterState } from "../World";
import { createTitleScreenSystem } from "./TitleScreenSystem";
import { createCharacterSelectionSystem } from "./CharacterSelectionSystem";
import { createInGameSystem } from "./InGameSystem";
import { createMultiplayerLobbySystem } from "./MultiplayerLobbySystem";
import { untrack } from "@solidjs/web";
import { createKeyBindingSystem } from "./KeyBindingSystem";
import { createLevelSelectionSystem } from "./LevelSelectionSystem";
import { createInGameSystemV2 } from "./InGameSystemV2";
import { registerComponents } from "@melty-karts/modelling";

export function createMasterSystem(ecs: ReactiveECS): System {
  let componentRegistry = registerComponents(ecs.ecs);
  let masterState = createMemo(() => ecs.resource(RegisteredMasterState).get("masterState") as MasterState);
  //
  let subsystems = createMemo(() => {
    switch (masterState()) {
      case MasterState.INTRO_SCREEN:
        return [
          createTitleScreenSystem(ecs),
        ];
      case MasterState.CHARACTER_SELECTION_SCREEN:
        return [
          createCharacterSelectionSystem(ecs),
        ];
      case MasterState.KEY_BINDINGS:
        return [
          createKeyBindingSystem(ecs),
        ];
      case MasterState.MULTIPLAYER_LOBBY:
        return [
          createMultiplayerLobbySystem(ecs, componentRegistry),
        ];
      case MasterState.LEVEL_SELECTION:
        return [
          untrack(() => createLevelSelectionSystem(
            componentRegistry,
            ecs,
          )),
        ];
      case MasterState.IN_GAME:
        return [
          untrack(() => createInGameSystem(ecs)),
        ];
      case MasterState.IN_GAME_V2:
        return [
          untrack(() => createInGameSystemV2(
            componentRegistry,
            ecs,
          )),
        ];
    }
  });
  //
  return {
    subsystems,
  };
}
