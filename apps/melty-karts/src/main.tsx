import { render } from "@solidjs/web";
import { createEffect, createMemo, createRoot, createSignal, onCleanup } from "solid-js";
import * as THREE from "three";
import { generateTrack, getTrackCurve, getGroundHeight, TRACK_WIDTH, createStartFinishLine } from "./models/Track";
import { World, RegisteredPosition, RegisteredVelocity, RegisteredOrientation } from "./World";
import { createKart } from "./Kart";
import { createRenderSystem } from "./systems/RenderSystem";
import { createKartPhysicsSystem } from "./systems/KartPhysicsSystem";
import { Joystick } from "./Joystick";
import { ActionButton } from "./ActionButton";

function createTree(height: number): THREE.Group {
  const group = new THREE.Group();
  
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, height * 0.4, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = height * 0.2;
  trunk.castShadow = true;
  group.add(trunk);
  
  const foliageGeo = new THREE.ConeGeometry(height * 0.4, height * 0.7, 6);
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.8 });
  const foliage = new THREE.Mesh(foliageGeo, foliageMat);
  foliage.position.y = height * 0.6;
  foliage.castShadow = true;
  group.add(foliage);
  
  return group;
}

function createBuilding(width: number, height: number, depth: number): THREE.Group {
  const group = new THREE.Group();
  
  const bodyGeo = new THREE.BoxGeometry(width, height, depth);
  const colors = [0x8b7765, 0xa08070, 0x9c8c7c, 0x7a6a5a];
  const bodyMat = new THREE.MeshStandardMaterial({ color: colors[Math.floor(Math.random() * colors.length)], roughness: 0.7 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  
  const roofGeo = new THREE.ConeGeometry(Math.max(width, depth) * 0.7, height * 0.3, 4);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.8 });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = height + height * 0.15;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);
  
  return group;
}

function placeProps(curve: THREE.CatmullRomCurve3, scene: THREE.Scene) {
  const bounds = computeWorldBounds(curve, 18);
  const trackPoints = curve.getSpacedPoints(200);
  const treeCount = 40;
  const buildingCount = 15;
  const minDistFromTrack = 5;
  const spread = 18;
  
  const rng = (i: number) => {
    const x = Math.sin(i * 7919) * 10000;
    return x - Math.floor(x);
  };
  
  for (let i = 0; i < treeCount + buildingCount; i++) {
    let x: number, z: number, dist: number;
    let attempts = 0;
    do {
      x = (rng(i * 2) - 0.5) * spread * 2 + bounds.centerX;
      z = (rng(i * 2 + 1) - 0.5) * spread * 2 + bounds.centerZ;
      dist = Infinity;
      for (const tp of trackPoints) {
        const d = Math.sqrt((tp.x - x) ** 2 + (tp.z - z) ** 2);
        if (d < dist) dist = d;
      }
      attempts++;
    } while (dist < minDistFromTrack && attempts < 20);
    
    if (dist < minDistFromTrack) continue;
    
    const groundY = getGroundHeight(x, z);
    
    if (i < treeCount) {
      const tree = createTree(1.5 + rng(i * 7) * 2);
      tree.position.set(x, groundY, z);
      scene.add(tree);
    } else {
      const w = 1 + rng(i * 3) * 2;
      const h = 1.5 + rng(i * 4) * 3;
      const d = 1 + rng(i * 5) * 2;
      const building = createBuilding(w, h, d);
      building.position.set(x, groundY, z);
      scene.add(building);
    }
  }
}

function computeWorldBounds(curve: THREE.CatmullRomCurve3, propSpread: number) {
  const points = curve.getSpacedPoints(200);
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const halfWidth = Math.max(maxX - minX, maxZ - minZ) / 2 + propSpread + 5;
  
  return { centerX, centerZ, size: halfWidth * 2 };
}

function createTerrain(curve: THREE.CatmullRomCurve3): { mesh: THREE.Mesh; bounds: { centerX: number; centerZ: number; size: number } } {
  const bounds = computeWorldBounds(curve, 18);
  const size = bounds.size;
  const resolution = 80;
  const vertices: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  
  const segments = 200;
  const trackPoints = curve.getSpacedPoints(segments);
  const halfSize = size / 2;
  
  for (let z = 0; z <= resolution; z++) {
    for (let x = 0; x <= resolution; x++) {
      const worldX = bounds.centerX - halfSize + (x / resolution) * size;
      const worldZ = bounds.centerZ - halfSize + (z / resolution) * size;
      
      let minDist = Infinity;
      let roadY = 0;
      for (let i = 0; i < segments; i++) {
        const dx = trackPoints[i].x - worldX;
        const dz = trackPoints[i].z - worldZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < minDist) {
          minDist = dist;
          roadY = trackPoints[i].y;
        }
      }
      
      const height = getGroundHeight(worldX, worldZ, minDist < TRACK_WIDTH / 2 + 3 ? roadY : undefined);
      
      vertices.push(worldX, height, worldZ);
      uvs.push(x / resolution * 4, z / resolution * 4);
    }
  }
  
  for (let z = 0; z < resolution; z++) {
    for (let x = 0; x < resolution; x++) {
      const a = z * (resolution + 1) + x;
      const b = a + 1;
      const c = (z + 1) * (resolution + 1) + x;
      const d = c + 1;
      
      indices.push(b, a, d);
      indices.push(c, d, a);
    }
  }
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  
  const material = new THREE.MeshStandardMaterial({
    color: 0x4a7c3f,
    roughness: 0.9,
    flatShading: true,
  });
  
  return { mesh: new THREE.Mesh(geometry, material), bounds };
}

let [ canvasSize, setCanvasSize ] = createSignal<THREE.Vector2>();

let [ upDown, setUpDown, ] = createSignal(false);
let [ downDown, setDownDown, ] = createSignal(false);
let [ leftDown, setLeftDown, ] = createSignal(false);
let [ rightDown, setRightDown, ] = createSignal(false);
let [ actionDown, setActionDown, ] = createSignal(false);
let [ driftDown, setDriftDown, ] = createSignal(false);

declare global {
  interface Window {
    upDown: boolean;
    downDown: boolean;
    leftDown: boolean;
    rightDown: boolean;
    actionDown: boolean;
    driftDown: boolean;
  }
}

function initScene(canvasDiv: HTMLDivElement, canvas: HTMLCanvasElement) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x5ba8c9);
  
  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);
  
  const dir = new THREE.DirectionalLight(0xffffff, 1);
  dir.position.set(20, 50, 20);
  dir.castShadow = true;
  dir.shadow.mapSize.width = 2048;
  dir.shadow.mapSize.height = 2048;
  scene.add(dir);
  
  const curve = getTrackCurve(42);
  
  const trackGroup = generateTrack(18, 30, 42);
  trackGroup.position.set(0, 0, 0);
  scene.add(trackGroup);
  
  const startFinishLine = createStartFinishLine(curve, 0);
  scene.add(startFinishLine);
  
  const { mesh: ground, bounds } = createTerrain(curve);
  const halfSize = bounds.size / 2;
  dir.shadow.camera.left = bounds.centerX - halfSize;
  dir.shadow.camera.right = bounds.centerX + halfSize;
  dir.shadow.camera.top = bounds.centerZ + halfSize;
  dir.shadow.camera.bottom = bounds.centerZ - halfSize;
  ground.receiveShadow = true;
  scene.add(ground);
  
  placeProps(curve, scene);
  
  const { ecs } = World();
  
  const t = 0.01;
  const startPos = curve.getPointAt(t);
  const lookAheadT = t + 0.01;
  const lookAheadPos = curve.getPointAt(lookAheadT);
  const direction = new THREE.Vector3().subVectors(lookAheadPos, startPos).normalize();
  
  const startVel = new THREE.Vector3(0, 0, 0);
  const kartEntityId = createKart({
    position: startPos,
    velocity: startVel,
    playerType: "Melty",
    facingForward: true,
    reactiveEcs: ecs,
  });
  
  const { dispose: disposeRender } = createRenderSystem(ecs, scene);
  const { update: updatePhysics } = createKartPhysicsSystem({
    ecs,
    entityId: kartEntityId,
    leftDown,
    rightDown,
    upDown,
    downDown,
    actionDown,
    driftDown,
  });

  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas, });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const camera = new THREE.PerspectiveCamera(75, 1.0, 0.1, 1000);

  let resizeObserver = new ResizeObserver(() => {
    let rect = canvasDiv.getBoundingClientRect();
    setCanvasSize(new THREE.Vector2(rect.width, rect.height));
    renderer.setSize(rect.width, rect.height);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  });
  resizeObserver.observe(canvasDiv);
  onCleanup(() => {
    resizeObserver.unobserve(canvasDiv);
    resizeObserver.disconnect();
  });

  const cameraHeight = 1.2;
  const cameraBehind = 2.5;

  let running = true;
  let lastTime = performance.now();
  const animate = () => {
    if (!running) return;
    
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    
    updatePhysics(dt);
    
    const posX = ecs.entity(kartEntityId).getField(RegisteredPosition, "x");
    const posY = ecs.entity(kartEntityId).getField(RegisteredPosition, "y");
    const posZ = ecs.entity(kartEntityId).getField(RegisteredPosition, "z");

    const kartPos = new THREE.Vector3(posX, posY, posZ);
    const qX = ecs.entity(kartEntityId).getField(RegisteredOrientation, "x");
    const qY = ecs.entity(kartEntityId).getField(RegisteredOrientation, "y");
    const qZ = ecs.entity(kartEntityId).getField(RegisteredOrientation, "z");
    const qW = ecs.entity(kartEntityId).getField(RegisteredOrientation, "w");
    let yaw = 0;
    const q = new THREE.Quaternion(qX, qY, qZ, qW);
    const euler = new THREE.Euler().setFromQuaternion(q);
    yaw = euler.y;

    const cameraOffset = new THREE.Vector3(
      -Math.sin(yaw) * cameraBehind,
      cameraHeight,
      -Math.cos(yaw) * cameraBehind
    );
    
    camera.position.copy(kartPos).add(cameraOffset);
    camera.lookAt(kartPos.x, kartPos.y + 0.3, kartPos.z);
    
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };
  animate();
  
  return () => {
    running = false;
    disposeRender();
    renderer.dispose();
  };
}

function App() {
  let [ canvasDiv, setCanvasDiv, ] = createSignal<HTMLDivElement>();
  let [ canvas, setCanvas, ] = createSignal<HTMLCanvasElement>();

  let joystickHitAreaSize = 150;
  let joystick = Joystick({
    position: createMemo(() =>
      new THREE.Vector2(
        50.0,
        (canvasSize()?.y ?? 0) - 50 - joystickHitAreaSize,
      )
    ),
    hitAreaSize: joystickHitAreaSize,
    outerRingSize: () => 0.8 * joystickHitAreaSize,
    knobSize: () => 70,
  });

  let actionButtonSize = 100;
  let actionButton = ActionButton({
    position: createMemo(() =>
      new THREE.Vector2(
        (canvasSize()?.x ?? 0) - 50 - actionButtonSize,
        (canvasSize()?.y ?? 0) - 50 - actionButtonSize,
      )
    ),
    size: () => actionButtonSize,
  });

  createEffect(() => joystick.value(), (joyValue) => {
    if (Math.abs(joyValue.x) > 0.1) {
      setLeftDown(joyValue.x < -0.1);
      setRightDown(joyValue.x > 0.1);
    } else {
      setLeftDown(false);
      setRightDown(false);
    }
  });

  createEffect(() => actionButton.pressed(), (pressed) => {
    setActionDown(pressed);
  });

  createEffect(() => [canvasDiv(), canvas()] as const, ([canvasDivVal, canvasVal]) => {
    if (canvasDivVal == undefined) {
      return;
    }
    if (canvasVal === undefined) {
      return;
    }
    createRoot((dispose) => {
      initScene(canvasDivVal, canvasVal);
      return dispose;
    });
  });
  
  return (
    <div
      ref={setCanvasDiv}
      style={{
        "width": "100%",
        "height": "100%",
      }}
    >
      <canvas
        ref={setCanvas}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
      <joystick.UI/>
      <actionButton.UI/>
    </div>
  );
}

const root = document.getElementById("root");
if (root) render(() => <App />, root);

document.addEventListener("keydown", (e) => {
  switch (e.key) {
    case "ArrowUp":
      setUpDown(true);
      break;
    case "ArrowDown":
      setDownDown(true);
      break;
    case "ArrowLeft":
      setLeftDown(true);
      break;
    case "ArrowRight":
      setRightDown(true);
      break;
    case " ":
      setActionDown(true);
      break;
    case "z":
    case "Z":
      setDriftDown(true);
      break;
  }
});

document.addEventListener("keyup", (e) => {
  switch (e.key) {
    case "ArrowUp":
      setUpDown(false);
      break;
    case "ArrowDown":
      setDownDown(false);
      break;
    case "ArrowLeft":
      setLeftDown(false);
      break;
    case "ArrowRight":
      setRightDown(false);
      break;
    case " ":
      setActionDown(false);
      break;
    case "z":
    case "Z":
      setDriftDown(false);
      break;
  }
});
