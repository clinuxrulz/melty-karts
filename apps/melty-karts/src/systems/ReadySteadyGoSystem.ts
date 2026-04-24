import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { System } from "./System";
import { ReadySteadyGoStage, RegisteredInGameState } from "../World";
import { createMemo } from "solid-js";
import { defaultReadySteadyGoConfig } from "../sounds/ReadySteadyGo";

export function createReadySteadyGoSystem(ecs: ReactiveECS): System {
  type InGameState = {
    isReadySteadyGo: number,
    readySteadyGoStage: number,
    readySteadyGoCurrentTimeout: number,
  };
  let updateInGameState = (fn: (x: InGameState) => InGameState) => {
    let res = ecs.resource(RegisteredInGameState);
    let newState = fn({
      isReadySteadyGo: res.get("isReadySteadyGo"),
      readySteadyGoStage: res.get("readySteadyGoStage"),
      readySteadyGoCurrentTimeout: res.get("readySteadyGoCurrentTimeout"),
    });
    ecs.set_resource(RegisteredInGameState, newState);
  };
  return {
    update(dt) {
      let isReadySteadyGo = ecs.resource(RegisteredInGameState).get("isReadySteadyGo");
      if (isReadySteadyGo) {
        let timer = ecs.resource(RegisteredInGameState).get("readySteadyGoCurrentTimeout");
        timer -= dt;
        if (timer > 0.0) {
          updateInGameState((s) => ({
            ...s,
            readySteadyGoCurrentTimeout: timer,
          }));
        } else {
          let readySteadyGoStage = ecs.resource(RegisteredInGameState).get("readySteadyGoStage");
          switch (readySteadyGoStage) {
            case ReadySteadyGoStage.READY:
              updateInGameState((s) => ({
                ...s,
                readySteadyGoStage: ReadySteadyGoStage.STEADY,
                readySteadyGoCurrentTimeout:
                  defaultReadySteadyGoConfig.goBeep.startTime
                    - defaultReadySteadyGoConfig.steadyBeep.startTime,
              }));
              break;
            case ReadySteadyGoStage.STEADY:
              updateInGameState((s) => ({
                ...s,
                readySteadyGoStage: ReadySteadyGoStage.GO,
                readySteadyGoCurrentTimeout: 4.0,
              }));
              break;
            default:
              updateInGameState((s) => ({
                ...s,
                isReadySteadyGo: 0,
                readySteadyGoStage: ReadySteadyGoStage.READY,
                readySteadyGoCurrentTimeout:
                  defaultReadySteadyGoConfig.steadyBeep.startTime
                    - defaultReadySteadyGoConfig.readyBeep.startTime,
              }));
              break;
          }
        }
      }
    },
  };
}

