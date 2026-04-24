import { createSignal, createMemo, Accessor, For } from "solid-js";
import { Howl } from "howler";

type SoundCategory = "Ready Steady Go" | "Engine" | "Crash" | "Other";

interface SoundDef {
  name: string;
  category: SoundCategory;
  create: () => Howl;
}

let [ soundLib, setSoundLib ] = createSignal<typeof import("../../melty-karts/src/sounds/ReadySteadyGo")>();

import("../../melty-karts/src/sounds/ReadySteadyGo").then(setSoundLib);

let [ readySteadyGoSound, setReadySteadyGoSound ] = createSignal<Howl | undefined>();

const sounds: SoundDef[] = [
  {
    name: "Ready Steady Go",
    category: "Ready Steady Go",
    create: () => {
      const lib = soundLib();
      if (!lib) {
        throw new Error("Sound library not loaded");
      }
      return lib.createReadySteadyGoSound();
    },
  },
];

export function createSoundTesterHMR(): Accessor<SoundDef[]> {
  return createMemo(() => sounds);
}

export function getReadySteadyGoSound(): Howl | undefined {
  const lib = soundLib();
  if (!lib) {
    return undefined;
  }
  return lib.createReadySteadyGoSound();
}

export function playReadySteadyGoFromTester(): void {
  const lib = soundLib();
  if (!lib) {
    console.warn("Sound library not loaded");
    return;
  }
  lib.playReadySteadyGo();
}

if (import.meta.hot) {
  import.meta.hot.accept("../../melty-karts/src/sounds/ReadySteadyGo", (lib) => {
    setSoundLib(lib as any);
  });
}