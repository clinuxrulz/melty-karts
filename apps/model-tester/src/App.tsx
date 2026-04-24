import { Accessor, createMemo, createEffect, createSignal, createStore, onCleanup, onSettled, type Component } from "solid-js";
import * as THREE from "three";
import { EffectComposer, OrbitControls, RenderPass, UnrealBloomPass } from "three/examples/jsm/Addons.js";
import { createCubeyModelHMR, createKartModelHMR, createMeltyModelHMR, createReadySteadyGoTrafficLightModelHMR, createSolidLogoModelHMR } from "./model-tester";
import { createReadySteadyGoSound, defaultReadySteadyGoConfig } from "../../melty-karts/src/sounds/ReadySteadyGo";

const App: Component = () => {
  let [ state, setState, ] = createStore<{
    model: "Melty" | "Cubey" | "SolidLogo" | "Kart" | "ReadySteadyGo",
  }>({
    model: "SolidLogo",
  });
  let [ canvasDiv, setCanvasDiv, ] = createSignal<HTMLDivElement>();
  let [ canvas, setCanvas, ] = createSignal<HTMLCanvasElement>();
  let [ renderer, setRenderer, ] = createSignal<THREE.WebGLRenderer>();
  let [ composer, setComposer, ] = createSignal<EffectComposer>();
  let [ camera, setCamera, ] = createSignal<THREE.PerspectiveCamera>();
  let [ orbitControls, setOrbitControls, ] = createSignal<OrbitControls>();
  let scene = new THREE.Scene();
  // lights
  {
    // Ambient light (soft, overall light)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    // Directional light (sun-like light)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);
  }
  // Grid helper and axes
  {
    let gridHelper = new THREE.GridHelper(6.0, 6);
    gridHelper.translateY(-0.001);
    scene.add(gridHelper);
    let axesHelper = new THREE.AxesHelper(1.5);
    scene.add(axesHelper);
  }
  let rerender = (() => {
    let aboutToRender = false;
    let render = () => {
      aboutToRender = false;
      let composer2 = composer();
      if (composer2 == undefined) {
        return;
      }
      composer2.render();
    };
    return () => {
      if (aboutToRender) {
        return;
      }
      aboutToRender = true;
      requestAnimationFrame(render);
    };
  })();
  onSettled(() => {
    let canvasDiv2 = canvasDiv();
    if (canvasDiv2 == undefined) {
      return undefined;
    }
    let canvas2 = canvas();
    if (canvas2 == undefined) {
      return undefined;
    }
    let renderer2 = new THREE.WebGLRenderer({
      canvas: canvas2,
    });
    let resizeObserver = new ResizeObserver(() => {
      let rect = canvasDiv2.getBoundingClientRect();
      renderer2.setSize(rect.width, rect.height);
      let camera2 = camera();
      if (camera2 != undefined) {
        camera2.aspect = rect.width / rect.height;
        camera2.updateProjectionMatrix();
        renderer2.render(scene, camera2);
      }
      let composer2 = composer();
      if (composer2 != undefined) {
        composer2.setSize(rect.width, rect.height);
      }
    });
    resizeObserver.observe(canvasDiv2);
    let cleanups: (() => void)[] = [];
    cleanups.push(() => {
      resizeObserver.unobserve(canvasDiv2);
      resizeObserver.disconnect();
    });
    let rect = canvasDiv2.getBoundingClientRect();
    let camera2 = new THREE.PerspectiveCamera();
    camera2.aspect = rect.width / rect.height;
    camera2.updateProjectionMatrix();
    camera2.position.set(5.0, 5.0, 5.0);
    camera2.lookAt(new THREE.Vector3(0.0, 0.0, 0.0));
    // Resolution, strength, radius, threshold
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(rect.width, rect.height), 
      1.5,  // strength
      0.4,  // radius
      0.85  // threshold
    );
    const composer2 = new EffectComposer(renderer2);
    const renderScene = new RenderPass(scene, camera2);
    composer2.addPass(renderScene);
    composer2.addPass(bloomPass);
    setComposer(composer2);
    //
    let orbitControls2 = new OrbitControls(camera2, canvasDiv2);
    orbitControls2.addEventListener("change", () => rerender());
    setRenderer(renderer2);
    setCamera(camera2);
    setOrbitControls(orbitControls2);
    rerender();
    return () => {
      cleanups.forEach((c) => c());
      cleanups.splice(0, cleanups.length);
    };
  });
  {
    let meltyModel = createMeltyModelHMR();
    let cubeyModel = createCubeyModelHMR();
    let solidLogoModel = createSolidLogoModelHMR();
    let kartModel = createKartModelHMR();
    let [ light, setLight, ] = createSignal<"Red" | "Yellow" | "Green">();
    let readySteadyGoModel = createReadySteadyGoTrafficLightModelHMR(light);
    let readySteadyGoSound = createReadySteadyGoSound();
    createEffect(
      () => state.model,
      (model) => {
        if (model !== "ReadySteadyGo") {
          setLight(undefined);
          return;
        }
        let stop = false;
        queueMicrotask(async () => {
          while (!stop) {
            setLight("Red");
            rerender();
            readySteadyGoSound.play();
            await new Promise<void>((resolve) => {
              setTimeout(
                () => {
                  resolve();
                },
                (
                  defaultReadySteadyGoConfig.steadyBeep.startTime
                ) * 1000.0,
              );
            });
            setLight("Yellow");
            rerender();
            await new Promise<void>((resolve) => {
              setTimeout(
                () => {
                  resolve();
                },
                (
                  defaultReadySteadyGoConfig.goBeep.startTime
                    - defaultReadySteadyGoConfig.steadyBeep.startTime
                ) * 1000.0,
              );
            });
            setLight("Green");
            rerender();
            await new Promise<void>((resolve) => {
              setTimeout(
                () => {
                  resolve();
                },
                4000.0,
              );
            });
          }
        });
        return () => { stop = true; };
      },
    );
    createMemo(() => {
      let model: Accessor<THREE.Object3D | undefined>;
      switch (state.model) {
        case "Melty":
          model = meltyModel;
          break;
        case "Cubey":
          model = cubeyModel;
          break;
        case "SolidLogo":
          model = solidLogoModel;
          break;
        case "Kart":
          model = kartModel;
          break;
        case "ReadySteadyGo":
          model = readySteadyGoModel;
          break;
      }
      createEffect(
        model,
        (model) => {
          if (model == undefined) {
            return undefined;
          }
          scene.add(model);
          rerender();
          return () => {
            scene.remove(model);
          };
        },
      );
    });
  }
  return (
    <div
      ref={setCanvasDiv}
      style={{
        "width": "100%",
        "height": "100%",
        "overflow": "hidden",
        "background-color": "darkgray",
      }}
    >
      <canvas ref={setCanvas}/>
      <select
        style={{
          "position": "absolute",
          "left": "5px",
          "top": "5px",
        }}
        onChange={(e) => {
          if (e.currentTarget.selectedOptions.length != 1) {
            return;
          }
          setState((s) => {
            s.model = e.currentTarget.selectedOptions[0].value as any;
          });
        }}
      >
        <option value="Melty" selected={state.model == "Melty"}>Melty</option>
        <option value="Cubey" selected={state.model == "Cubey"}>Cubey</option>
        <option value="SolidLogo" selected={state.model == "SolidLogo"}>SolidLogo</option>
        <option value="Kart" selected={state.model == "Kart"}>Kart</option>
        <option value="ReadySteadyGo" selected={state.model == "ReadySteadyGo"}>ReadySteadyGo</option>
      </select>
    </div>
  );
};

export default App;
