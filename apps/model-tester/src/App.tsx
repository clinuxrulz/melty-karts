import { Accessor, createMemo, createEffect, createSignal, createStore, onCleanup, onSettled, type Component } from "solid-js";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import { createCubeyModelHMR, createMeltyModelHMR, createSolidLogoModelHMR } from "./model-tester";

const App: Component = () => {
  let [ state, setState, ] = createStore<{
    model: "Melty" | "Cubey" | "SolidLogo",
  }>({
    model: "SolidLogo",
  });
  let [ canvasDiv, setCanvasDiv, ] = createSignal<HTMLDivElement>();
  let [ canvas, setCanvas, ] = createSignal<HTMLCanvasElement>();
  let [ renderer, setRenderer, ] = createSignal<THREE.WebGLRenderer>();
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
      let renderer2 = renderer();
      if (renderer2 == undefined) {
        return;
      }
      let camera2 = camera();
      if (camera2 == undefined) {
        return;
      }
      renderer2.render(scene, camera2);
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
      </select>
    </div>
  );
};

export default App;
