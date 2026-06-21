import { Component, createRenderEffect, onCleanup } from "solid-js";
import * as THREE from "three";
import { T } from "../t";
import { TSL, MeshBasicNodeMaterial } from "three/webgpu";
const { uniform, attribute, vec3, vec4, mod, smoothstep, mix, clamp, length, positionLocal, modelViewMatrix, cameraProjectionMatrix, vec2, sub, add, mul, div, max, reciprocal, screenSize, uv } = TSL;

function getRandomSpherePoint(out: THREE.Vector3) {
  const u1 = Math.random();
  const u2 = Math.random();

  const theta = 2 * Math.PI * u1;
  const v = u2;

  const sqrtTerm = Math.sqrt(v * (1 - v));

  const x = 2 * sqrtTerm * Math.cos(theta);
  const y = 2 * sqrtTerm * Math.sin(theta);
  const z = 2 * v - 1;

  out.x = x;
  out.y = y;
  out.z = z;
}

// Shared resources created once at module init
const _sharedFire = (() => {
  const particleCount = 1000;

  const positions = new Float32Array(particleCount * 3);
  const drift = new Float32Array(particleCount * 3);
  const life = new Float32Array(particleCount);
  const offset = new Float32Array(particleCount);
  const size = new Float32Array(particleCount);

  let pt = new THREE.Vector3();

  for (let i = 0; i < particleCount; i += 1) {
    const stride = i * 3;
    getRandomSpherePoint(pt);
    positions[stride + 0] = pt.x * 0.0012;
    positions[stride + 1] = pt.y * 0.0012;
    positions[stride + 2] = pt.z * 0.0012;

    drift[stride + 0] = pt.x * 2.0;
    drift[stride + 1] = pt.y * 2.0;
    drift[stride + 2] = pt.z * 2.0;

    life[i] = 1.0;
    offset[i] = 0.3 * Math.random() * life[i];
    size[i] = 16.0 + Math.random() * 20.0;
  }

  // Build quad geometry: 4 vertices + 6 indices per particle
  const quadPositions = new Float32Array(particleCount * 4 * 3);
  const quadCorners = new Float32Array(particleCount * 4 * 2);
  const quadUvs = new Float32Array(particleCount * 4 * 2);
  const quadIndices = new Uint16Array(particleCount * 6);
  const quadDrift = new Float32Array(particleCount * 4 * 3);
  const quadLife = new Float32Array(particleCount * 4);
  const quadOffset = new Float32Array(particleCount * 4);
  const quadSize = new Float32Array(particleCount * 4);

  const cornerData = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

  for (let i = 0; i < particleCount; i++) {
    const v0 = i * 4;
    for (let j = 0; j < 4; j++) {
      const vi = v0 + j;
      const ps = i * 3;
      const vs = vi * 3;
      quadPositions[vs + 0] = positions[ps + 0];
      quadPositions[vs + 1] = positions[ps + 1];
      quadPositions[vs + 2] = positions[ps + 2];
      quadCorners[vi * 2 + 0] = cornerData[j][0];
      quadCorners[vi * 2 + 1] = cornerData[j][1];
      quadUvs[vi * 2 + 0] = (cornerData[j][0] + 1) / 2;
      quadUvs[vi * 2 + 1] = (cornerData[j][1] + 1) / 2;
      quadDrift[vs + 0] = drift[ps + 0];
      quadDrift[vs + 1] = drift[ps + 1];
      quadDrift[vs + 2] = drift[ps + 2];
      quadLife[vi] = life[i];
      quadOffset[vi] = offset[i];
      quadSize[vi] = size[i];
    }
    const i0 = v0;
    quadIndices[i * 6 + 0] = i0 + 0;
    quadIndices[i * 6 + 1] = i0 + 1;
    quadIndices[i * 6 + 2] = i0 + 2;
    quadIndices[i * 6 + 3] = i0 + 0;
    quadIndices[i * 6 + 4] = i0 + 2;
    quadIndices[i * 6 + 5] = i0 + 3;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(quadPositions, 3));
  geometry.setAttribute("aCorner", new THREE.BufferAttribute(quadCorners, 2));
  geometry.setAttribute("aDrift", new THREE.BufferAttribute(quadDrift, 3));
  geometry.setAttribute("aLife", new THREE.BufferAttribute(quadLife, 1));
  geometry.setAttribute("aOffset", new THREE.BufferAttribute(quadOffset, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(quadSize, 1));
  geometry.setAttribute("uv", new THREE.BufferAttribute(quadUvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(quadIndices, 1));

  const uTime = uniform(0);
  const uIsPerspective = uniform(1);
  const aCorner = attribute<"vec2">("aCorner", "vec2");
  const aDrift = attribute<"vec3">("aDrift", "vec3");
  const aLife = attribute<"float">("aLife", "float");
  const aOffset = attribute<"float">("aOffset", "float");
  const aSize = attribute<"float">("aSize", "float");

  const lifeT = div(mod(add(uTime, aOffset), aLife), aLife);
  const fadeIn = smoothstep(0.0, 0.08, lifeT);
  const fadeOut = sub(1.0, smoothstep(0.35, 1.0, lifeT));
  const vFade = mul(fadeIn, fadeOut);
  const vHeat = sub(1.0, lifeT);

  const driftOffset = mul(aDrift, lifeT);
  const animatedPos = add(positionLocal, driftOffset);

  // Compute size in viewport pixels
  const mvPos = mul(modelViewMatrix, vec4(animatedPos, 1.0));
  const dist = length(mvPos.xyz);
  const perspScale = mix(0.25, reciprocal(max(dist, 0.1)), uIsPerspective);
  const particleSize = max(mul(mul(mul(aSize, 8.0), lifeT), perspScale), 0.0);

  // Billboard: offset in clip space by corner * size
  const clipPos = mul(cameraProjectionMatrix, mvPos);
  const ndcOffset = div(mul(aCorner, particleSize), screenSize);
  const clipOffset = mul(ndcOffset, clipPos.w);
  const finalPos = vec4(add(clipPos.xy, clipOffset), clipPos.zw);

  // Fragment: radial gradient via UV
  const centered = sub(uv(), vec2(0.5));
  const ptDist = length(centered);
  const circleAlpha = ptDist.lessThanEqual(0.5).select(1.0, 0.0);
  const core = sub(1.0, smoothstep(0.0, 0.28, ptDist));
  const edge = sub(1.0, smoothstep(0.12, 0.5, ptDist));

  const ember = vec3(1.0, 0.22, 0.02);
  const flame = vec3(1.0, 0.55, 0.08);
  const spark = vec3(1.0, 0.95, 0.55);
  const heatClamped = clamp(mul(vHeat, 1.2), 0.0, 1.0);
  const color = mix(ember, flame, heatClamped);
  const finalColor = mix(color, spark, core);

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  material.vertexNode = finalPos;
  material.colorNode = finalColor;
  material.opacityNode = mul(mul(edge, vFade), circleAlpha);

  return { geometry, material, uTime, uIsPerspective };
})();


const Explosion: Component<{
  time: number,
}> = (props) => {
  let fireMaterial = _sharedFire.material.clone();
  onCleanup(() => fireMaterial.dispose());
  createRenderEffect(
    () => props.time,
    (time) => {
      _sharedFire.uTime.value = time;
    },
  );
  return (
    <T.Mesh
      geometry={_sharedFire.geometry}
      material={fireMaterial}
    />
  );
};

export default Explosion;
