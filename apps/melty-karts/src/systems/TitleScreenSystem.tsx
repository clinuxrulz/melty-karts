import { type Component } from "solid-js";
import { JSX as SolidJSX } from "@solidjs/web";
import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { System } from "./System";
import { MasterState, RegisteredGameMode, RegisteredMasterState } from "../World";
import { multiplayerSession } from "../netcode/MultiplayerSession";

export function createTitleScreenSystem(ecs: ReactiveECS): System {
  const startSinglePlayer = () => {
    multiplayerSession.leave();
    ecs.set_resource(RegisteredGameMode, { mode: 0 });
    ecs.set_resource(RegisteredMasterState, { masterState: MasterState.CHARACTER_SELECTION_SCREEN });
  };

  const startMultiplayer = () => {
    ecs.set_resource(RegisteredGameMode, { mode: 1 });
    ecs.set_resource(RegisteredMasterState, { masterState: MasterState.CHARACTER_SELECTION_SCREEN });
  };

  const UI: Component = () => {
    return (
      <div
        style={{
          position: "absolute",
          inset: "0",
          display: "flex",
          "flex-direction": "column",
          "align-items": "center",
          "justify-content": "center",
          background: "#1a1a1a",
          color: "#ffffff",
          "font-family": "Arial, sans-serif",
        }}
      >
        <div
          style={{
            "font-size": "72px",
            "font-weight": "bold",
            "margin-bottom": "40px",
            "text-shadow": "4px 4px 8px rgba(0, 0, 0, 0.7)",
            "background": "linear-gradient(45deg, #ff00ff, #00ffff)",
            "-webkit-background-clip": "text",
            "-webkit-text-fill-color": "transparent",
            "text-align": "center",
          }}
        >
          Melty Karts
        </div>

        <div style={{ display: "flex", "flex-direction": "column", gap: "16px", "width": "240px" }}>
          <button 
            type="button" 
            onClick={startSinglePlayer} 
            style={basicButton("#ffffff", "#1a1a1a")}
          >
            Single Player
          </button>
          <button 
            type="button" 
            onClick={startMultiplayer} 
            style={basicButton("#5fcf8f", "#08120c")}
          >
            Multiplayer
          </button>
        </div>

        {multiplayerSession.hasInviteInUrl() && (
          <div style={{ "margin-top": "24px", color: "#9fe5b0", "font-size": "14px" }}>
            Invite detected! Open Multiplayer to join.
          </div>
        )}
      </div>
    );
  };

  return {
    ui: () => UI,
  };
}

function basicButton(background: string, color: string) {
  return {
    padding: "12px 24px",
    "border-radius": "8px",
    border: "none",
    background,
    color,
    cursor: "pointer",
    "font-size": "18px",
    "font-weight": "bold",
    "transition": "transform 0.1s active",
    "box-shadow": "0 4px 0 rgba(0,0,0,0.3)",
  };
}
