import { Accessor, createSignal, For, type Component, createEffect } from "solid-js";
import { Howl } from "howler";
import { playReadySteadyGoFromTester } from "./sound-tester";
import { powerupItemBox, slotSpinLoop, slotReelSpin } from "../../melty-karts/src/sounds/slot-machine";

const App: Component = () => {
  const [ activeSound, setActiveSound ] = createSignal<string | null>(null);
  const [ soundInstance, setSoundInstance ] = createSignal<Howl | null>(null);

  const buttonStyle = {
    padding: "10px 20px",
    "font-size": "16px",
    cursor: "pointer",
    "background-color": "#4CAF50",
    color: "white",
    border: "none",
    "border-radius": "4px",
    margin: "5px",
  };

  const playReadySteadyGo = () => {
    setActiveSound("Ready Steady Go");
    playReadySteadyGoFromTester();
    setTimeout(() => setActiveSound(null), 2000);
  };

  const playPowerupItemBox = () => {
    setActiveSound("Powerup Item Box");
    powerupItemBox.play();
    setTimeout(() => setActiveSound(null), 1000);
  };

  const playSlotLoop = () => {
    setActiveSound("Slot Machine");
    slotSpinLoop.play();
    setTimeout(() => {
      slotSpinLoop.stop();
      slotReelSpin.play();
      setActiveSound(null);
    }, 3000);
  };

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        height: "100%",
        "background-color": "#222",
        color: "white",
        "font-family": "system-ui, sans-serif",
      }}
    >
      <h1 style={{ "margin-bottom": "30px" }}>Sound Tester</h1>
      
      <div style={{ "margin-bottom": "20px" }}>
        <button style={buttonStyle} onClick={playReadySteadyGo}>
          Play Ready Steady Go
        </button><br/>
        <button style={buttonStyle} onClick={playPowerupItemBox}>
          Play Powerup Item Box
        </button><br/>
        <button style={buttonStyle} onClick={playSlotLoop}>
          Play Slot Machine
        </button>
      </div>

      {activeSound() && (
        <div
          style={{
            "margin-top": "20px",
            padding: "10px 20px",
            "background-color": "#444",
            "border-radius": "4px",
          }}
        >
          Playing: {activeSound()}
        </div>
      )}

      <div
        style={{
          "margin-top": "40px",
          color: "#888",
          "font-size": "12px",
        }}
      >
        <p>Ready Steady Go: Three beeps at the start of a race</p>
        <p>1. "Ready" - 880Hz tone at 0s</p>
        <p>2. "Steady" - 880Hz tone at 0.5s</p>
        <p>3. "Go" - 1760Hz tone at 1.0s</p>
      </div>
    </div>
  );
};

export default App;