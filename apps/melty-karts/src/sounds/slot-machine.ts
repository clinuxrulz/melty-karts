import { Howl } from "howler";

export const powerupItemBox = new Howl({
  src: "./sounds/powerup_item_box.ogg",
});

export const slotSpinLoop = new Howl({
  src: "./sounds/slot_spin_loop.ogg",
  loop: true,
  rate: 0.8,
  volume: 0.5,
});

export const slotReelSpin = new Howl({
  src: "./sounds/slot_reel_spin.ogg",
  rate: 0.8,
  volume: 0.5,
});
