import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { RegisteredJoystickInput, RegisteredKeyboardInput } from "../World";
import { multiplayerSession } from "../netcode/MultiplayerSession";

export function createRollbackNetcodeSystem(ecs: ReactiveECS): { dispose: () => void } {
  const session = multiplayerSession.session;
  if (!session) {
    return {
      dispose: () => {},
    };
  }

  let frameHandle = 0;
  let accumulator = 0;
  let lastTime = performance.now();
  const stepMs = 1000 / 60;
  let disposed = false;

  const frame = () => {
    if (disposed) {
      return;
    }

    const now = performance.now();
    accumulator += Math.min(now - lastTime, 250);
    lastTime = now;

    while (accumulator >= stepMs) {
      session.tick(readLocalInput(ecs));
      accumulator -= stepMs;
    }

    frameHandle = requestAnimationFrame(frame);
  };

  frameHandle = requestAnimationFrame(frame);

  return {
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frameHandle);
    },
  };
}

function readLocalInput(ecs: ReactiveECS): Uint8Array {
  const keyboard = ecs.ecs.resource(RegisteredKeyboardInput);
  const joystick = ecs.ecs.resource(RegisteredJoystickInput);

  const left = keyboard.leftDown !== 0 || joystick.joystickX < -0.2;
  const right = keyboard.rightDown !== 0 || joystick.joystickX > 0.2;
  const accelerate = keyboard.actionDown !== 0 || keyboard.upDown !== 0 || joystick.joystickY < -0.2;
  const drift = keyboard.driftDown !== 0;

  const mask =
    (accelerate ? 0b0001 : 0) |
    (drift ? 0b0010 : 0) |
    (left ? 0b0100 : 0) |
    (right ? 0b1000 : 0);

  return new Uint8Array([mask]);
}
