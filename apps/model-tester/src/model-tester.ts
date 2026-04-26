import { createSignal, createMemo, Accessor } from "solid-js";
import * as THREE from "three";

let [ meltyLib, setMeltyLib, ] = createSignal<typeof import("../../melty-karts/src/models/melty")>();
let [ cubeyLib, setCubeyLib, ] = createSignal<typeof import("../../melty-karts/src/models/cubey")>();
let [ solidLogoLib, setSolidLogoLib, ] = createSignal<typeof import("../../melty-karts/src/models/SolidLogo")>();
let [ kartLib, setKartLib, ] = createSignal<typeof import("../../melty-karts/src/models/Kart")>();
let [ readySteadyGoLib, setReadySteadyGoLib ] =
  createSignal<typeof import("../../melty-karts/src/models/ReadySteadyGoTrafficLight")>(
    async () => import("../../melty-karts/src/models/ReadySteadyGoTrafficLight")
  );
let [ bananaLib, setBananaLib ] =
  createSignal<typeof import("../../melty-karts/src/models/banana")>(
    async () => import("../../melty-karts/src/models/banana")
  );

import("../../melty-karts/src/models/melty").then(setMeltyLib);
import("../../melty-karts/src/models/cubey").then(setCubeyLib);
import("../../melty-karts/src/models/SolidLogo").then(setSolidLogoLib);
import("../../melty-karts/src/models/Kart").then(setKartLib);

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

export function createKartModelHMR(): Accessor<THREE.Object3D | undefined> {
  let result_ = createMemo(() => {
    let kartLib2 = kartLib();
    if (kartLib2 == undefined) {
      return undefined;
    }
    return createMemo(async () => await kartLib2.loadKartModel());
  });
  return createMemo(() => result_()?.());
}

export function createReadySteadyGoTrafficLightModelHMR(lightOn: Accessor<"Red" | "Yellow" | "Green" | undefined>): Accessor<THREE.Object3D | undefined> {
  return createMemo(() => readySteadyGoLib().createReadySteadyGoTrafficLight(lightOn));
}

export function createBananaModelHMR(): Accessor<THREE.Object3D> {
  return createMemo(() => bananaLib().createBanana());
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
  import.meta.hot.accept("../../melty-karts/src/models/Kart", (lib) => {
    setKartLib(lib as any);
  });
  import.meta.hot.accept("../../melty-karts/src/models/ReadySteadyGoTrafficLight", (lib) => {
    setReadySteadyGoLib(lib as any);
  });
  import.meta.hot.accept("../../melty-karts/src/models/banana", (lib) => {
    setBananaLib(lib as any);
  });
}
