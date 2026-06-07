import { createMemo, createStore } from "solid-js";
import * as THREE from "three";
import { Mode, ModeParams } from "../mode";
import { constAccessor } from "../../util";
import { ThreeJsUserData } from "../threejs-user-data";

export function createSelectionMode(modeParams: ModeParams): Mode {
  let [ state, setState, ] = createStore<{
    selectedObjectsById: string[],
  }>({
    selectedObjectsById: [],
  });
  let selectedObjectsByIdSet = createMemo(() => new Set(state.selectedObjectsById));
  let raycaster = new THREE.Raycaster();
  let objectUnderMouseById = createMemo(() => {
    let scene = modeParams.threeScene();
    if (scene === undefined) {
      return undefined;
    }
    let camera = modeParams.threeCamera();
    if (camera === undefined) {
      return undefined;
    }
    let mouseRay = modeParams.mouseRay();
    if (mouseRay === undefined) {
      return undefined;
    }
    raycaster.camera = camera;
    raycaster.ray.copy(mouseRay);
    let intersections = raycaster.intersectObject(scene, true);
    for (let int of intersections) {
      if (int.face === undefined || int.face === null) {
        continue;
      }
      let object = int.object;
      if (object.userData.type !== "ThreeJsUserData") {
        continue;
      }
      let userData = object.userData as ThreeJsUserData;
      return userData.modelNodePath;
    }
    return undefined;
  });
  let instructions = constAccessor(() => {
    return (<>{objectUnderMouseById()?.length}</>)
  });
  let onPointerDown = () => {
    let objectId = objectUnderMouseById();
    if (objectId === undefined) {
      setState((s) => { s.selectedObjectsById = []; });
    } else {
      setState((s) => { s.selectedObjectsById = [ objectId, ]; });
    }
  };
  return {
    instructions,
    selectedObjectsByIdSet,
    onPointerDown,
  };
}
