import { Accessor, createMemo, createEffect, createSignal, createStore, onCleanup, onSettled, type Component, Show, JSX } from "solid-js";
import * as THREE from "three";
import { EffectComposer, OrbitControls, RenderPass, UnrealBloomPass } from "three/examples/jsm/Addons.js";
import { createBananaModelHMR, createCubeyModelHMR, createKartModelHMR, createMeltyModelHMR, createReadySteadyGoTrafficLightModelHMR, createSolidLogoModelHMR } from "./model-tester";
import { createReadySteadyGoSound, defaultReadySteadyGoConfig } from "../../melty-karts/src/sounds/ReadySteadyGo";
import { Canvas, Entity, useThree } from "solid-three";
import { T } from "../../melty-karts/src/t";
import { Dynamic, untrack } from "@solidjs/web";

const App: Component = () => {
  let [ state, setState, ] = createStore<{
    model: "Melty" | "Cubey" | "SolidLogo" | "Kart" | "ReadySteadyGo" | "Banana",
  }>({
    model: "SolidLogo",
  });
  let [ canvasDiv, setCanvasDiv, ] = createSignal<HTMLDivElement>();
  let [ canvas, setCanvas, ] = createSignal<HTMLCanvasElement>();
  let [ renderer, setRenderer, ] = createSignal<THREE.WebGLRenderer>();
  let [ composer, setComposer, ] = createSignal<EffectComposer>();
  let [ camera, setCamera, ] = createSignal<THREE.PerspectiveCamera>();
  let [ orbitControls, setOrbitControls, ] = createSignal<OrbitControls>();
  /*
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
  */
  /*
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
  */
  /*
  let model: Accessor<THREE.Object3D | undefined>;
  {
    let meltyModel = createMeltyModelHMR();
    let cubeyModel = createCubeyModelHMR();
    let solidLogoModel = createSolidLogoModelHMR();
    let kartModel = createKartModelHMR();
    let [ light, setLight, ] = createSignal<"Red" | "Yellow" | "Green">();
    let readySteadyGoModel = createReadySteadyGoTrafficLightModelHMR(light);
    let readySteadyGoSound = createReadySteadyGoSound();
    let bananaModel = createBananaModelHMR();
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
    model = createMemo(() => {
      switch (state.model) {
        case "Melty":
          return meltyModel();
        case "Cubey":
          return cubeyModel();
        case "SolidLogo":
          return solidLogoModel();
        case "Kart":
          return kartModel();
        case "ReadySteadyGo":
          return readySteadyGoModel();
        case "Banana":
          return bananaModel();
      }
    });
  }
  let model2 = createMemo<JSX.Element>(() => {
    let model3 = model();
    return untrack(() => (<Entity from={model3}/>));
  });
  */
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
      <Canvas
        ref={(ctx) => {
          ctx.camera.lookAt(0.0, 0.0, 0.0);
          onSettled(() => {
            let canvasDiv2 = canvasDiv();
            if (canvasDiv2 == undefined) {
              return;
            }
            let rect = canvasDiv2.getBoundingClientRect();
            setCanvas(ctx.canvas);
            // Resolution, strength, radius, threshold
            const bloomPass = new UnrealBloomPass(
              new THREE.Vector2(rect.width, rect.height), 
              1.5,  // strength
              0.4,  // radius
              0.85  // threshold
            );
            const composer2 = new EffectComposer(ctx.gl as unknown as THREE.WebGLRenderer);
            const renderScene = new RenderPass(ctx.scene as unknown as THREE.Scene, ctx.camera as unknown as THREE.PerspectiveCamera);
            composer2.addPass(renderScene);
            composer2.addPass(bloomPass);
            setComposer(composer2);
            composer2.render();
            setTimeout(() => composer2.render(), 1000);
          });
        }}
        defaultCamera={{ position: [ 5.0, 5.0, 5.0, ] }}
        scene={{ background: [0.1, 0.1, 0.15] }}
      >
        {/* Lights */}
        <T.AmbientLight
          args={[ 0xFFFFFF, 0.5 ]}
        />
        <T.DirectionalLight
          args={[ 0xFFFFFF, 1.0, ]}
          position={[ 5.0, 10.0, 7.0 ]}
        />
        {/* Grid helper and axes */}
        <T.GridHelper
          args={[ 6.0, 6, ]}
          position={[ 0.0, -0.001, 0.0, ]}
        />
        <T.AxesHelper
          args={[ 1.5, ]}
        />
        <T.Mesh>
          <T.BoxGeometry
            args={[ 1, 1, 1, ]}
          />
          <T.MeshNormalMaterial/>
        </T.Mesh>
        {/*
        <Show when={model2()}>
          {(model) => (
            <Dynamic component={() => model()}/>
          )}
        </Show>
        */}
      </Canvas>
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
        <option value="Banana" selected={state.model == "Banana"}>Banana</option>
      </select>
    </div>
  );
};

export default App;
