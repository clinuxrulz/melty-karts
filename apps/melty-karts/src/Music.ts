import { Howl } from "howler";

export const introMusic = new Howl({
  src: "./music/somewhat-good-karts/KARTS!.ogg",
  volume: 0.5,
  loop: true,
});

export const characterSelectionMusic = new Howl({
  src: "./music/somewhat-good-karts/Choose Your Racer.ogg",
  volume: 0.5,
  loop: true,
});

export const raceMusic = new Howl({
  src: "./music/somewhat-good-karts/Flowey Speedway.ogg",
  volume: 0.5,
  loop: true,
});