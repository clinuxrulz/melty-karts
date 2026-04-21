import { createSignal, type Accessor, type Component, onCleanup } from "solid-js";
import * as THREE from "three";
import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { System } from "./System";
import { MasterState, RegisteredMasterState } from "../World";

export function createTitleScreenSystem(ecs: ReactiveECS): System {
  const [showClickPrompt, setShowClickPrompt] = createSignal(true);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Space" || e.code === "Enter" || e.code === "KeyK") {
      setShowClickPrompt(false);
      ecs.set_resource(RegisteredMasterState, { masterState: MasterState.CHARACTER_SELECTION_SCREEN });
    }
  };

  const handleClick = () => {
    if (showClickPrompt()) {
      setShowClickPrompt(false);
      ecs.set_resource(RegisteredMasterState, { masterState: MasterState.CHARACTER_SELECTION_SCREEN });
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("click", handleClick);
  window.addEventListener("touchstart", handleClick);

  onCleanup(() => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("click", handleClick);
    window.removeEventListener("touchstart", handleClick);
  });

  const UI: Component = () => {
    const [clicked, setClicked] = createSignal(false);

    const handlePointerDown = () => {
      setClicked(true);
      setTimeout(() => setClicked(false), 100);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") {
        handlePointerDown();
      }
    };

    return (
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          "text-align": "center",
          color: clicked() ? "#ffff00" : "#ffffff",
          "font-family": "Arial, sans-serif",
          "font-size": "24px",
          "text-shadow": "0 0 10px rgba(255, 255, 255, 0.5)",
          "pointer-events": clicked() ? "none" : "auto",
        }}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        tabindex={0}
      >
        <div
          style={{
            "font-size": "72px",
            "font-weight": "bold",
            "margin-bottom": "20px",
            "text-shadow": "4px 4px 8px rgba(0, 0, 0, 0.7)",
            "background": "linear-gradient(45deg, #ff00ff, #00ffff)",
            "-webkit-background-clip": "text",
            "-webkit-text-fill-color": "transparent",
          }}
        >
          Melty Karts
        </div>
        {showClickPrompt() && (
          <div
            style={{
              "font-size": "24px",
              "color": "#ffffff",
              "text-shadow": "2px 2px 4px rgba(0, 0, 0, 0.5)",
            }}
          >
            Press any key or tap to continue
          </div>
        )}
      </div>
    );
  };

  return {
    ui: () => UI,
  };
}
