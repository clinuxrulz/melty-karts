import { createSignal, createMemo, type Accessor, type Component, type Signal, onCleanup, untrack } from "solid-js";
import { JSX } from "@solidjs/web";
import * as THREE from "three";

const MAX_HOLD_TIME = 1.0;

export function ActionButton(params: {
  position: Accessor<THREE.Vector2>,
  size: Accessor<number>,
  externalPressed?: Accessor<boolean>,
}): {
  position: Accessor<THREE.Vector2>,
  size: Accessor<number>,
  pressed: Accessor<boolean>,
  power: Accessor<number>,
  justReleased: Accessor<boolean>,
  justReleasedExternal: Accessor<boolean>,
  UI: Component,
} {
  const [pressed, setPressed] = createSignal(false);
  const [pressStartTime, setPressStartTime] = createSignal(0);
  const [wasPressed, setWasPressed] = createSignal(false);
  const [tick, setTick] = createSignal(0);
  const [externalWasPressed, setExternalWasPressed] = createSignal(false);
  
  const externalPressed = params.externalPressed || (() => false);
  
  let intervalId: number | undefined;
  let lastExternalPressed = false;

  const startTracking = () => {
    if (intervalId) return;
    intervalId = window.setInterval(() => {
      setTick(t => t + 1);
    }, 50);
  };

  const stopTracking = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = undefined;
    }
  };

  onCleanup(() => stopTracking());

  requestAnimationFrame(function checkExternal() {
    const ext = externalPressed();
    if (ext && !lastExternalPressed) {
      setPressStartTime(performance.now());
      startTracking();
    }
    if (!ext && lastExternalPressed) {
      setExternalWasPressed(true);
    }
    lastExternalPressed = ext;
    requestAnimationFrame(checkExternal);
  });

  const isPressed = () => pressed() || externalPressed();

  const power = createMemo(() => {
    tick();
    const p = isPressed();
    const t = pressStartTime();
    if (!p) return 0;
    const holdTime = (performance.now() - t) / 1000;
    return Math.min(holdTime / MAX_HOLD_TIME, 1.0);
  });

  const handlePointerDown: JSX.EventHandler<HTMLDivElement, PointerEvent> = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setPressed(true);
    setPressStartTime(performance.now());
    startTracking();
  };

  const handlePointerUp: JSX.EventHandler<HTMLDivElement, PointerEvent> = (e) => {
    setPressed(false);
    stopTracking();
    setWasPressed(true);
  };

  const handlePointerLeave: JSX.EventHandler<HTMLDivElement, PointerEvent> = (e) => {
    if (pressed()) {
      setPressed(false);
      stopTracking();
      setWasPressed(true);
    }
  };

  const UI: Component = () => {
    return (
      <div
        style={{
          position: "absolute",
          left: `${params.position().x}px`,
          top: `${params.position().y}px`,
          width: `${params.size()}px`,
          height: `${params.size()}px`,
          "border-radius": `${0.5 * params.size()}px`,
          "background-color": isPressed() ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.5)",
          "user-select": "none",
          "touch-action": "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onContextMenu={(e) => e.preventDefault()}
      />
    );
  };

  return {
    position: params.position,
    size: params.size,
    pressed: isPressed,
    power,
    justReleased: () => {
      if (wasPressed()) {
        setWasPressed(false);
        return true;
      }
      return false;
    },
    justReleasedExternal: () => {
      if (externalWasPressed()) {
        setExternalWasPressed(false);
        return true;
      }
      return false;
    },
    UI,
  };
}