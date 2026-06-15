import { Component, createRenderEffect, onCleanup, onSettled } from "solid-js";
import { useFrame } from "solid-three";
import { T } from "../t";

import * as THREE from "three";
import { TSL, MeshBasicNodeMaterial } from "three/webgpu";
const { uniform, attribute, vec3, vec4, mod, smoothstep, mix, clamp, length, positionLocal, modelViewMatrix, cameraProjectionMatrix, vec2, sin, cos, sub, add, mul, div, max, reciprocal, screenSize, uv } = TSL;

// Shared resources created once at module init
const _sharedWickFire = (() => {
  const particleCount = 48;

  const positions = new Float32Array(particleCount * 3);
  const drift = new Float32Array(particleCount * 3);
  const life = new Float32Array(particleCount);
  const offset = new Float32Array(particleCount);
  const size = new Float32Array(particleCount);
  const spin = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i += 1) {
    const stride = i * 3;
    positions[stride + 0] = (Math.random() - 0.5) * 0.012;
    positions[stride + 1] = Math.random() * 0.01;
    positions[stride + 2] = (Math.random() - 0.5) * 0.012;

    drift[stride + 0] = (Math.random() - 0.5) * 0.05;
    drift[stride + 1] = 0.08 + Math.random() * 0.06;
    drift[stride + 2] = (Math.random() - 0.5) * 0.05;

    life[i] = 0.45 + Math.random() * 0.35;
    offset[i] = Math.random() * life[i];
    size[i] = 16.0 + Math.random() * 20.0;
    spin[i] = Math.random() * Math.PI * 2.0;
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
  const quadSpin = new Float32Array(particleCount * 4);

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
      quadSpin[vi] = spin[i];
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
  geometry.setAttribute("aSpin", new THREE.BufferAttribute(quadSpin, 1));
  geometry.setAttribute("uv", new THREE.BufferAttribute(quadUvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(quadIndices, 1));

  const uTime = uniform(0);
  const uIsPerspective = uniform(1);
  const aCorner = attribute<"vec2">("aCorner", "vec2");
  const aDrift = attribute<"vec3">("aDrift", "vec3");
  const aLife = attribute<"float">("aLife", "float");
  const aOffset = attribute<"float">("aOffset", "float");
  const aSize = attribute<"float">("aSize", "float");
  const aSpin = attribute<"float">("aSpin", "float");

  const lifeT = div(mod(add(uTime, aOffset), aLife), aLife);
  const fadeIn = smoothstep(0.0, 0.08, lifeT);
  const fadeOut = sub(1.0, smoothstep(0.35, 1.0, lifeT));
  const vFade = mul(fadeIn, fadeOut);
  const vHeat = sub(1.0, lifeT);

  const swirl = mul(mul(sin(add(add(mul(uTime, 10.0), aSpin), mul(lifeT, 12.0))), 0.012), sub(1.0, lifeT));
  const flicker = mul(sin(add(mul(uTime, 24.0), aSpin)), 0.004);

  const driftOffset = mul(aDrift, lifeT);
  const base = add(positionLocal, driftOffset);
  const animPos = vec3(
    add(base.x, swirl),
    add(base.y, add(mul(mul(lifeT, lifeT), 0.12), flicker)),
    add(base.z, mul(mul(cos(add(add(mul(uTime, 8.0), aSpin), mul(lifeT, 10.0))), 0.006), sub(1.0, lifeT)))
  );

  // Compute size in viewport pixels
  const mvPos = mul(modelViewMatrix, vec4(animPos, 1.0));
  const dist = length(mvPos.xyz);
  const perspScale = mix(0.25, reciprocal(max(dist, 0.1)), uIsPerspective);
  const particleSize = max(mul(mul(aSize, vFade), perspScale), 1.0);

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

const _sharedWickShape = (() => {
  let s = new THREE.Shape();
  s.absellipse(0.0, 0.0, 0.01, 0.01, 0.0, 2.0 * Math.PI);
  return s;
})();

const _sharedWickPath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0.0, 0.0, 0.0),
  new THREE.Vector3(0.0, 0.1, 0.0),
  new THREE.Vector3(0.1, 0.15, 0.0),
  new THREE.Vector3(0.12, 0.2, 0.0),
]);

const _sharedBodyMaterial = new THREE.MeshStandardMaterial({ color: "#6e6e6e" });

const Bomb: Component<{
  onHMR?: () => void,
  time: number,
}> = (props) => {
  if (props.onHMR !== undefined) {
    let onHMR = props.onHMR;
    onSettled(() => {
      onHMR();
    });
  }
  // Clone body material per-instance (outputNode safety for slot machine clip)
  let material = _sharedBodyMaterial.clone();
  onCleanup(() => material.dispose());
  // Clone wick fire material per-instance, but share geometry, uTime, uIsPerspective
  const wickFireMaterial = _sharedWickFire.material.clone();
  onCleanup(() => wickFireMaterial.dispose());
  createRenderEffect(
    () => props.time,
    (time) => {
      _sharedWickFire.uTime.value = time;
    },
  );
  let q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0.0, 0.0, 1.0), -0.25 * Math.PI);
  let qi = q.clone().invert();
  return (
    <T.Group>
      <T.Group
        quaternion={q}
      >
        <T.Mesh material={material}>
          <T.SphereGeometry
            args={[0.3,]}
          />
        </T.Mesh>
        <T.Mesh material={material}>
          <T.CylinderGeometry
            ref={(geometry) => {
              geometry.translate(0.0, 0.32, 0.0);
            }}
            args={[0.07, 0.07, 0.07,]}
          />
        </T.Mesh>
        <T.Mesh
          position={[0.0, 0.35, 0.0,]}
        >
          <T.ExtrudeGeometry
            args={[
              _sharedWickShape,
              {
                steps: 20,
                bevelEnabled: false,
                extrudePath: _sharedWickPath,
              },
            ]}
          />
          <T.MeshStandardMaterial
            color="#ffffff"
          />
        </T.Mesh>
        <T.Mesh
          position={[0.12, 0.55, 0.0]}
          quaternion={qi}
          geometry={_sharedWickFire.geometry}
          material={wickFireMaterial}
        />
      </T.Group>
    </T.Group>
  );
};

export default Bomb;
