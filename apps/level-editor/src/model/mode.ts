import { Accessor, Component } from "solid-js";
import * as THREE from "three";

export interface ModeParams {
  threeScene: Accessor<THREE.Scene | undefined>,
  threeCamera: Accessor<THREE.Camera | undefined>,
  mousePos: Accessor<THREE.Vector2 | undefined>,
  mouseRay: Accessor<THREE.Ray | undefined>,
  screenPtToWorldRay: (pt: THREE.Vector2) => THREE.Ray | undefined;
  projectWorldPtToScreen: (pt: THREE.Vector3) => THREE.Vector2 | undefined;
}

export interface Mode {
  instructions?: Accessor<Component | undefined>;
  sideForm?: Accessor<Component | undefined>;
  overlay3d?: Accessor<Component | undefined>;
  selectedObjectsByIdSet?: Accessor<Set<string>>;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
}
