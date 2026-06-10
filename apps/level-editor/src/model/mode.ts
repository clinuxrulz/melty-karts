import { Accessor, Component } from "solid-js";
import * as THREE from "three";
import { ResolvedModelNode } from "./model-node";
import { Command } from "./commands";
import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { ComponentRegistry } from "./components/registry";
import { Operation } from "./operation";

export interface ModeParams {
  ecs: ReactiveECS,
  componentRegistry: ComponentRegistry,
  canvas: Accessor<HTMLCanvasElement | undefined>,
  threeScene: Accessor<THREE.Scene | undefined>,
  threeCamera: Accessor<THREE.Camera | undefined>,
  mousePos: Accessor<THREE.Vector2 | undefined>,
  mouseRay: Accessor<THREE.Ray | undefined>,
  screenPtToWorldRay: (pt: THREE.Vector2) => THREE.Ray | undefined,
  projectWorldPtToScreen: (pt: THREE.Vector3) => THREE.Vector2 | undefined,
  idToModelNodeMap: Accessor<Map<string,ResolvedModelNode>>,
  doOperation: (operation: Operation) => void,
  doCommand: (command: Command, addToUndoStack?: boolean, undoDescription?: string) => void,
}

export interface Mode {
  instructions?: Accessor<Component | undefined>;
  sideForm?: Accessor<Component | undefined>;
  overlay3d?: Accessor<Component | undefined>;
  selectedObjectsByIdSet?: Accessor<Set<string>>;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  orbitControlsEnabled?: Accessor<boolean>;
}
