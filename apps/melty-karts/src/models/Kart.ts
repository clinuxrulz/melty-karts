import * as THREE from "three";
import { OBJLoader } from "three-stdlib";
import { TRACK_WIDTH } from "./Track";

export async function loadKartModel(): Promise<THREE.Group> {
  const loader = new OBJLoader();
  
  try {
    const response = await fetch("./models/kart.obj");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    
    const kart = loader.parse(text);
    
    kart.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        
        if (child.material instanceof THREE.Material) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat.name?.includes("Blue")) {
            mat.color.setHex(0x3a6ea5);
            mat.roughness = 0.5;
            mat.metalness = 0.2;
          } else if (mat.name?.includes("Grey")) {
            const greyMatch = mat.name.match(/Grey_-_(\d+)/);
            if (greyMatch) {
              const greyLevel = parseInt(greyMatch[1]) / 100;
              mat.color.setRGB(greyLevel, greyLevel, greyLevel);
            }
            mat.roughness = 0.7;
            mat.metalness = 0.3;
          }
        }
      }
    });
    
    const box = new THREE.Box3().setFromObject(kart);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 1.5;
    const scale = targetSize / maxDim;
    kart.scale.setScalar(scale);
    
    box.setFromObject(kart);
    const center = box.getCenter(new THREE.Vector3());
    kart.position.x -= center.x;
    kart.position.y -= center.y;
    kart.position.z -= center.z;
    
    return kart;
  } catch (e) {
    console.error("Failed to load kart:", e);
    throw e;
  }
}

export async function placeKartAtStart(
  curve: THREE.CatmullRomCurve3,
  scene: THREE.Scene
): Promise<THREE.Group> {
  const kart = await loadKartModel();
  
  const t = 0.01;
  const pos = curve.getPointAt(t);
  const tangent = curve.getTangentAt(t);
  const tangent2D = new THREE.Vector2(tangent.x, tangent.z).normalize();
  const normal2D = new THREE.Vector2(-tangent2D.y, tangent2D.x);
  
  const offset = TRACK_WIDTH / 4;
  kart.position.set(
    pos.x + normal2D.x * offset,
    pos.y + 0.05,
    pos.z + normal2D.y * offset
  );
  
  const angle = Math.atan2(tangent.x, tangent.z);
  kart.rotation.y = angle + Math.PI;
  
  scene.add(kart);
  return kart;
}