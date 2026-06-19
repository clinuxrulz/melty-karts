import { Component } from "solid-js";
import { System } from "./System";
import { MasterState, RegisteredMasterState } from "../World";
import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { ComponentRegistry, loadEcsFromXml } from "@melty-karts/modelling";

export function createLevelSelectionSystem(
  componentRegistry: ComponentRegistry,
  ecs: ReactiveECS,
): System {
  let loadProceduralLevel = () => {
    ecs.set_resource(RegisteredMasterState, { masterState: MasterState.IN_GAME, });
  };
  let loadNewLevel = async () => {
    let level = await fetch(/* @vite-ignore */"./levels/test-level.melty-karts-level");
    let levelData = await level.text();
    loadEcsFromXml(
      componentRegistry,
      ecs,
      levelData,
    );
    ecs.set_resource(RegisteredMasterState, { masterState: MasterState.IN_GAME_V2, });
  };
  const UI: Component = () => {
    return (
      <div
        style={{
          "position": "absolute",
          "top": "50%",
          "left": "50%",
          "transform": "translate(-50%,-50%)",
          "display": "flex",
          "flex-direction": "column",
          "align-items": "center",
        }}
      >
        <h1 style={{
          "font-size": "32pt",
          "color": "red",
          "padding-bottom": "20px",
        }}>
          Select Level
        </h1>
        <div
          style="display: flex; flex-direction: column;"
        >
          <button
            style={{
              "font-size": "28pt",
              "color": "white",
              "background-color": "blue",
              "border-radius": "50px",
              "padding": "20px",
            }}
            onClick={() => {
              loadProceduralLevel();
            }}
          >
            Procedural Level
          </button>
          <button
            style={{
              "font-size": "28pt",
              "color": "white",
              "background-color": "blue",
              "border-radius": "50px",
              "padding": "20px",
              "margin-top": "20px",
            }}
            onClick={() => {
              loadNewLevel();
            }}
          >
            New Level
          </button>
        </div>
      </div>
    );
  };
  return {
    ui: () => UI,
  };
}

