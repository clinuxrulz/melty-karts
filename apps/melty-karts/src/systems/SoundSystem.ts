import { Howl } from "howler";
import type { Accessor } from "solid-js";
import type { ReactiveECS } from "@melty-karts/reactive-ecs";
import type { EntityID } from "@oasys/oecs";
import { RegisteredKartConfig, RegisteredPreReadySteadyGoDelayFinished } from "../World";
import { createReadySteadyGoSound } from "../sounds/ReadySteadyGo";

export function createSoundSystem(ecs: ReactiveECS, getSoundEnabled?: Accessor<boolean>) {

  const readySteadyGoSound = createReadySteadyGoSound();

  const engineSound = new Howl({
    src: ["./engine.mp3"],
    loop: true,
    volume: 0.5,
    autoplay: false,
    onloaderror: (id, err) => console.error("Engine load error:", err),
    onplayerror: (id, err) => console.error("Engine play error:", err),
  });

  const hitSound = new Howl({
    src: ["./crash.ogg"],
    volume: 0.5,
    onloaderror: (id, err) => console.error("Crash load error:", err),
  });

  let engineStarted = false;
  let lastEngineSpeed = 0;
  let wasEnabled = true;
  let wasPreReadySteadyGoDelayFinshed = ecs.resource(RegisteredPreReadySteadyGoDelayFinished).get("value");

  const update = (dt: number, playerEntityId: EntityID) => {
    const isEnabled = getSoundEnabled ? getSoundEnabled() : true;
    
    if (!isEnabled && engineStarted) {
      engineSound.stop();
      engineStarted = false;
      console.log("Sound disabled, stopped engine");
    }
    
    if (!isEnabled) {
      return;
    }
    
    if (!engineStarted && wasEnabled) {
      engineSound.play();
      engineStarted = true;
      console.log("Sound enabled, started engine");
    }
    
    wasEnabled = isEnabled;

    if (!wasPreReadySteadyGoDelayFinshed) {
      let readySteadyGoDelayFinshed = ecs.resource(RegisteredPreReadySteadyGoDelayFinished).get("value");
      if (readySteadyGoDelayFinshed) {
        readySteadyGoSound.play();
      }
      wasPreReadySteadyGoDelayFinshed = readySteadyGoDelayFinshed;
    }

    const speed = ecs.entity(playerEntityId).getField(RegisteredKartConfig, "speed");
    
    if (Math.abs(speed - lastEngineSpeed) > 0.5 || speed < 1) {
      const pitch = 0.6 + (speed / 40) * 1.2;
      engineSound.rate(Math.max(0.5, Math.min(pitch, 2.0)));
      lastEngineSpeed = speed;
    }

    if ((ecs as any)._lastCollision) {
      const intensity = Math.min((ecs as any)._lastCollision, 1.0);
      if (intensity > 0.1) {
        hitSound.volume(intensity * 0.6);
        hitSound.play();
      }
      (ecs as any)._lastCollision = 0;
    }
  };

  const dispose = () => {
    engineSound.stop();
    engineSound.unload();
    hitSound.unload();
  };

  return { update, dispose };
}
