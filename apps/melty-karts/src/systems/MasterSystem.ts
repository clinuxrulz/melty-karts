import { ReactiveECS } from "@melty-karts/reactive-ecs"
import { System } from "./System";
import { createMemo, createRoot } from "solid-js";
import { MasterState, RegisteredMasterState } from "../World";
import { createTitleScreenSystem } from "./TitleScreenSystem";
import { createCharacterSelectionSystem } from "./CharacterSelectionSystem";
import { createInGameSystem } from "./InGameSystem";
import { untrack } from "@solidjs/web";

export function createMasterSystem(ecs: ReactiveECS): System {
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
      case MasterState.IN_GAME:
        return [
          untrack(() => createInGameSystem(ecs)),
        ];
    }
  });
  //
  return {
    subsystems,
  };
}
