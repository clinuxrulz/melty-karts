import { createSignal, createMemo, Accessor } from "solid-js";
import * as THREE from "three";

let [ meltyLib, setMeltyLib, ] = createSignal<typeof import("../../melty-karts/src/models/melty")>();
let [ cubeyLib, setCubeyLib, ] = createSignal<typeof import("../../melty-karts/src/models/cubey")>();
let [ solidLogoLib, setSolidLogoLib, ] = createSignal<typeof import("../../melty-karts/src/models/SolidLogo")>();

import("../../melty-karts/src/models/melty").then(setMeltyLib);
import("../../melty-karts/src/models/cubey").then(setCubeyLib);
import("../../melty-karts/src/models/SolidLogo").then(setSolidLogoLib);

export function createMeltyModelHMR(): Accessor<THREE.Object3D | undefined> {
  return createMemo(() => {
    let meltyLib2 = meltyLib();
    if (meltyLib2 == undefined) {
      return undefined;
    }
    return meltyLib2.createMelty();
  });
}

export function createCubeyModelHMR(): Accessor<THREE.Object3D | undefined> {
  return createMemo(() => {
    let cubeyLib2 = cubeyLib();
    if (cubeyLib2 == undefined) {
      return undefined;
    }
    return cubeyLib2.createCubey();
  });
}

export function createSolidLogoModelHMR(): Accessor<THREE.Object3D | undefined> {
  return createMemo(() => {
    let solidLogoLib2 = solidLogoLib();
    if (solidLogoLib2 == undefined) {
      return undefined;
    }
    return solidLogoLib2.createSolidLogo();
  });
}


if (import.meta.hot) {
  import.meta.hot.accept("../../melty-karts/src/models/melty", (lib) => {
    setMeltyLib(lib as any);
  });
  import.meta.hot.accept("../../melty-karts/src/models/cubey", (lib) => {
    setCubeyLib(lib as any);
  });
  import.meta.hot.accept("../../melty-karts/src/models/SolidLogo", (lib) => {
    setSolidLogoLib(lib as any);
  });
}
