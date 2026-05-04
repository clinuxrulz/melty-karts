import * as THREE from "three";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// @ts-ignore
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
// @ts-ignore
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export const TRACK_WIDTH = 12;
export const BARRIER_HEIGHT = 0.25;

class PerlinNoise2D {
  private perm: number[] = [];
  
  constructor(seed: number = 0) {
    const p: number[] = [];
    for (let i = 0; i < 256; i++) p[i] = i;
    
    let n = seed;
    for (let i = 255; i > 0; i--) {
      n = (n * 1103515245 + 12345) & 0x7fffffff;
      const j = n % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }
    
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  
  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  
  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }
  
  private grad(hash: number, x: number, z: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : z;
    const v = h < 2 ? z : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
  
  noise(x: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    z -= Math.floor(z);
    const u = this.fade(x);
    const v = this.fade(z);
    
    const A = this.perm[X] + Z;
    const B = this.perm[X + 1] + Z;
    
    return this.lerp(
      this.lerp(this.grad(this.perm[A], x, z), this.grad(this.perm[B], x - 1, z), u),
      this.lerp(this.grad(this.perm[A + 1], x, z - 1), this.grad(this.perm[B + 1], x - 1, z - 1), u),
      v
    );
  }
  
  fbm(x: number, z: number, octaves: number = 4): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;
    
    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.noise(x * frequency, z * frequency);
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    
    return value / maxValue;
  }
}

export const groundNoise = new PerlinNoise2D(54321);
export const trackNoise = new PerlinNoise2D(12345);

interface TrackInstance {
  curve: THREE.CatmullRomCurve3;
  roadMeshes: THREE.Mesh[];
  points: THREE.Vector3[];
}
let trackInstance: TrackInstance | null = null;

export function getTrackCurve(seed: number = 12345): THREE.CatmullRomCurve3 {
  if (trackInstance) return trackInstance.curve;
  
  const rng = (n: number) => {
    const x = Math.sin(seed * 9999 + n * 7919) * 10000;
    return x - Math.floor(x);
  };
  
  const anchorCount = 12 + Math.floor(rng(0) * 6);
  const centerX = 15;
  const centerZ = 15;
  const baseRadius = 160;
  
  const controlPoints: THREE.Vector3[] = [];
  for (let i = 0; i < anchorCount; i++) {
    const angle = (i / anchorCount) * Math.PI * 2;
    const radiusVar = 0.7 + rng(i + 1) * 0.6;
    const x = centerX + Math.cos(angle) * baseRadius * radiusVar;
    const z = centerZ + Math.sin(angle) * baseRadius * radiusVar;
    
    const t = i / anchorCount;
    const dipCenter = 0.5;
    const dipWidth = 0.08;
    const dipDepth = 6.0;
    const dipAmount = Math.exp(-Math.pow(t - dipCenter, 2) / (2 * Math.pow(dipWidth, 2)));
    
    const y = getGroundHeight(x, z) + 0.1 - dipAmount * dipDepth;
    controlPoints.push(new THREE.Vector3(x, y, z));
  }
  
  const curve = new THREE.CatmullRomCurve3(controlPoints);
  curve.closed = true;
  curve.curveType = "centripetal";
  curve.tension = 0.5;
  
  return curve;
}

export function getGroundHeight(x: number, z: number): number {
  const scale = 0.01;
  const groundY = groundNoise.fbm(x * scale, z * scale, 4) * 40;
  return groundY;
}

function generateProceduralTrack(seed: number = 12345): { group: THREE.Group; curve: THREE.CatmullRomCurve3; roadMeshes: THREE.Mesh[] } {
  const group = new THREE.Group();
  const curve = getTrackCurve(seed);
  
  const totalSegments = 800;
  const chunks = 10;
  const segmentsPerChunk = totalSegments / chunks;
  const points = curve.getSpacedPoints(totalSegments);
  
  const hw = TRACK_WIDTH / 2;
  const totalLength = curve.getLength();
  const texScale = 10;

  const roadMaterial = new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });

  const roadMeshes: THREE.Mesh[] = [];

  for (let c = 0; c < chunks; c++) {
    const vertices: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    
    const startIdx = c * segmentsPerChunk;
    const endIdx = (c + 1) * segmentsPerChunk;

    for (let i = startIdx; i <= endIdx; i++) {
      const t = i / totalSegments;
      const pos = points[i];
      const tangent = curve.getTangentAt(t % 1);
      
      const tangent2D = new THREE.Vector2(tangent.x, tangent.z).normalize();
      const normal2D = new THREE.Vector2(-tangent2D.y, tangent2D.x);
      
      const u = (t * totalLength) / texScale;
      
      vertices.push(
        pos.x + normal2D.x * hw, pos.y + 0.05, pos.z + normal2D.y * hw,
        pos.x - normal2D.x * hw, pos.y + 0.05, pos.z - normal2D.y * hw
      );
      
      uvs.push(0, u, 1, u);
      
      if (i < endIdx) {
        const localIdx = i - startIdx;
        const a = localIdx * 2;
        const b = localIdx * 2 + 1;
        const nextA = (localIdx + 1) * 2;
        const nextB = (localIdx + 1) * 2 + 1;
        
        indices.push(a, nextA, b, b, nextA, nextB);
      }
    }
    
    const roadGeometry = new THREE.BufferGeometry();
    roadGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    roadGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    roadGeometry.setIndex(indices);
    roadGeometry.computeVertexNormals();
    
    // @ts-ignore
    roadGeometry.computeBoundsTree();
    
    const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
    roadMesh.receiveShadow = true;
    group.add(roadMesh);
    roadMeshes.push(roadMesh);
  }

  // Segmented barriers
  for (let side = 0; side < 2; side++) {
    const barrierMat = new THREE.MeshStandardMaterial({
      color: side === 0 ? 0xcc0000 : 0xdddddd,
      roughness: 0.3,
      metalness: 0.5,
    });

    for (let c = 0; c < chunks; c++) {
      const offsetPoints: THREE.Vector3[] = [];
      const startIdx = c * segmentsPerChunk;
      const endIdx = (c + 1) * segmentsPerChunk;

      for (let i = startIdx; i <= endIdx; i++) {
        const t = i / totalSegments;
        const pos = points[i];
        const tangent = curve.getTangentAt(t % 1);
        
        const tangent2D = new THREE.Vector2(tangent.x, tangent.z).normalize();
        const normal2D = new THREE.Vector2(-tangent2D.y, tangent2D.x);
        
        const offset = side === 0 ? -hw - 0.2 : hw + 0.2;
        const worldX = pos.x + normal2D.x * offset;
        const worldZ = pos.z + normal2D.y * offset;
        offsetPoints.push(new THREE.Vector3(worldX, pos.y + 0.15, worldZ));
      }

      const barrierCurveChunk = new THREE.CatmullRomCurve3(offsetPoints);
      const barrierGeo = new THREE.TubeGeometry(barrierCurveChunk, segmentsPerChunk, 0.06, 6, false);
      
      // @ts-ignore
      barrierGeo.computeBoundsTree();
      
      const barrierMesh = new THREE.Mesh(barrierGeo, barrierMat);
      barrierMesh.castShadow = true;
      group.add(barrierMesh);
    }
    
    const postCount = 24;
    for (let i = 0; i < postCount; i++) {
      const t = i / postCount;
      const pos = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);
      const tangent2D = new THREE.Vector2(tangent.x, tangent.z).normalize();
      const normal2D = new THREE.Vector2(-tangent2D.y, tangent2D.x);
      
      const offset = side === 0 ? -hw - 0.2 : hw + 0.2;
      const worldX = pos.x + normal2D.x * offset;
      const worldZ = pos.z + normal2D.y * offset;

      const postGeo = new THREE.BoxGeometry(0.12, 0.35, 0.12);
      const postMesh = new THREE.Mesh(postGeo, barrierMat);
      postMesh.position.set(worldX, pos.y + 0.15 + 0.175, worldZ);
      postMesh.castShadow = true;
      group.add(postMesh);
    }
  }
  
  // Props... (keeping existing logic but integrated)
  const propCount = 40;
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < propCount; i++) {
      const t = Math.random();
      const pos = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);
      const normal2D = new THREE.Vector2(-tangent.z, tangent.x).normalize();
      
      const offset = side === 0 ? -hw - 36 - Math.random() * 48 : hw + 36 + Math.random() * 48;
      const worldX = pos.x + normal2D.x * offset;
      const worldZ = pos.z + normal2D.y * offset;
      const y = getGroundHeight(worldX, worldZ) + 0.1;
      
      if (Math.random() > 0.5) {
        // Simple procedural tree (not using the main app's instanced props here for simplicity in Track.ts)
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.6), new THREE.MeshStandardMaterial({ color: 0x8b4513 }));
        trunk.position.set(worldX, y + 0.3, worldZ);
        group.add(trunk);
        const foliage = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.5), new THREE.MeshStandardMaterial({ color: 0x228b22 }));
        foliage.position.set(worldX, y + 0.8, worldZ);
        group.add(foliage);
      }
    }
  }

  // Rock tunnel
  const tunnelT = 0.5;
  const tunnelRange = 0.2;
  const rockSegments = 90;
  const rocksPerSegment = 8;
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1.0, flatShading: true });
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const totalRocks = (rockSegments + 1) * rocksPerSegment;
  const instancedRocks = new THREE.InstancedMesh(rockGeo, rockMat, totalRocks);
  group.add(instancedRocks);
  const dummy = new THREE.Object3D();
  let rockIndex = 0;
  for (let i = 0; i <= rockSegments; i++) {
    const t = tunnelT - tunnelRange + (i / rockSegments) * (tunnelRange * 2);
    const pos = curve.getPointAt((t + 1) % 1);
    const tangent = curve.getTangentAt((t + 1) % 1);
    const normal2D = new THREE.Vector2(-tangent.z, tangent.x).normalize();
    const normal = new THREE.Vector3(normal2D.x, 0, normal2D.y);
    const up = new THREE.Vector3(0, 1, 0);
    for (let j = 0; j < rocksPerSegment; j++) {
      const angle = -0.2 + (j / (rocksPerSegment - 1)) * (Math.PI + 0.4);
      const rockSize = 3.5 + Math.random() * 2.5;
      const baseRadius = (TRACK_WIDTH / 2) + rockSize * 0.9 + 0.5;
      const radius = baseRadius + Math.random() * 5.0;
      const rockPos = pos.clone().add(normal.clone().multiplyScalar(Math.cos(angle) * radius)).add(up.clone().multiplyScalar(Math.max(-0.2, Math.sin(angle)) * radius * 0.8));
      dummy.position.copy(rockPos);
      dummy.scale.setScalar(rockSize);
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      dummy.updateMatrix();
      instancedRocks.setMatrixAt(rockIndex++, dummy.matrix);
    }
  }
   
  return { group, curve, roadMeshes };
}

export function generateTrack(seed: number = 12345): { group: THREE.Group; curve: THREE.CatmullRomCurve3 } {
  const r = generateProceduralTrack(seed);
  trackInstance = {
    curve: r.curve,
    roadMeshes: r.roadMeshes,
    points: r.curve.getSpacedPoints(800)
  };
  return r;
}

export function getTrackCurveForPhysics(): THREE.CatmullRomCurve3 | null {
  return trackInstance?.curve ?? null;
}

export function getTrackMeshesForPhysics(): THREE.Mesh[] {
  return trackInstance?.roadMeshes ?? [];
}

export function getTrackWidth(): number {
  return TRACK_WIDTH;
}

export function isPointOnTrack(x: number, z: number, margin: number = 0): boolean {
  if (!trackInstance) return false;
  const dist = getDistanceToTrackCenter(x, z);
  return dist <= TRACK_WIDTH / 2 + margin;
}

export function getDistanceToTrackCenter(x: number, z: number): number {
  if (!trackInstance) return Infinity;
  
  // Using the spaced points for a fast approximation as requested
  // In a full implementation we would use roadMeshes[i].geometry.boundsTree.closestPointToPoint
  let minDistSq = Infinity;
  const p = new THREE.Vector3(x, 0, z);
  
  // We can optimize this further by only checking points near the last known position
  // but for now, 800 points is still fast compared to 800 * karts
  for (const point of trackInstance.points) {
    const dx = point.x - x;
    const dz = point.z - z;
    const dSq = dx * dx + dz * dz;
    if (dSq < minDistSq) {
      minDistSq = dSq;
    }
  }
  
  return Math.sqrt(minDistSq);
}

export function getTrackHeightAt(t: number, curve?: THREE.CatmullRomCurve3): number {
  const c = curve || trackInstance?.curve;
  if (!c) return 0;
  const pos = c.getPointAt(t % 1);
  return pos.y;
}

export function createStartFinishLine(curve: THREE.CatmullRomCurve3, t: number = 0): THREE.Group {
  const group = new THREE.Group();
  const pos = curve.getPointAt(t);
  const tangent = curve.getTangentAt(t);
  const tangent2D = new THREE.Vector2(tangent.x, tangent.z).normalize();
  const normal2D = new THREE.Vector2(-tangent2D.y, tangent2D.x);
  
  const lineWidth = TRACK_WIDTH + 0.4;
  const lineLength = 0.6;
  const checkSize = 0.15;
  const checksX = Math.ceil(lineWidth / checkSize);
  const checksZ = Math.ceil(lineLength / checkSize);
  
  for (let cx = 0; cx < checksX; cx++) {
    for (let cz = 0; cz < checksZ; cz++) {
      const isWhite = (cx + cz) % 2 === 0;
      const geo = new THREE.PlaneGeometry(checkSize, checkSize);
      const mat = new THREE.MeshStandardMaterial({ color: isWhite ? 0xffffff : 0x222222, side: THREE.DoubleSide });
      const check = new THREE.Mesh(geo, mat);
      const xOffset = (cx - checksX / 2 + 0.5) * checkSize;
      const zOffset = (cz - checksZ / 2 + 0.5) * checkSize;
      check.position.set(pos.x + normal2D.x * xOffset - tangent2D.x * zOffset, pos.y + 0.06, pos.z + normal2D.y * xOffset - tangent2D.y * zOffset);
      check.rotation.x = -Math.PI / 2;
      check.rotation.z = Math.atan2(tangent.x, tangent.z);
      group.add(check);
    }
  }
  
  const bannerHeight = 2.5;
  const postGeo = new THREE.CylinderGeometry(0.05, 0.05, bannerHeight, 8);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5 });
  const leftPost = new THREE.Mesh(postGeo, postMat);
  leftPost.position.set(pos.x - normal2D.x * (lineWidth / 2 + 0.3), pos.y + bannerHeight / 2, pos.z - normal2D.y * (lineWidth / 2 + 0.3));
  group.add(leftPost);
  const rightPost = new THREE.Mesh(postGeo, postMat);
  rightPost.position.set(pos.x + normal2D.x * (lineWidth / 2 + 0.3), pos.y + bannerHeight / 2, pos.z + normal2D.y * (lineWidth / 2 + 0.3));
  group.add(rightPost);

  const bannerWidth = lineWidth + 1;
  const bannerGeo = new THREE.PlaneGeometry(bannerWidth, 0.4);
  const bannerMat = new THREE.MeshStandardMaterial({ 
    color: 0xff0000, 
    side: THREE.DoubleSide,
    metalness: 0.3
  });
  const banner = new THREE.Mesh(bannerGeo, bannerMat);
  banner.position.set(pos.x, pos.y + bannerHeight, pos.z);
  banner.rotation.y = Math.atan2(tangent.x, tangent.z);
  group.add(banner);
  
  return group;
}
