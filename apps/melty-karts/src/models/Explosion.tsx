import { Component, createMemo, createRenderEffect, onCleanup } from "solid-js";
import * as THREE from "three";
import { T } from "../t";

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

const createFire = () => {
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

    life[i] = 1.0;//0.8 + Math.random() * 0.1;
    offset[i] = 0.3 * Math.random() * life[i];
    size[i] = 16.0 + Math.random() * 20.0;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aDrift", new THREE.BufferAttribute(drift, 3));
  geometry.setAttribute("aLife", new THREE.BufferAttribute(life, 1));
  geometry.setAttribute("aOffset", new THREE.BufferAttribute(offset, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      uniform float uTime;

      attribute vec3 aDrift;
      attribute float aLife;
      attribute float aOffset;
      attribute float aSize;

      varying float vFade;
      varying float vHeat;
      #include <clipping_planes_pars_vertex>

      void main() {
        float age = mod(uTime + aOffset, aLife);
        float lifeT = age / aLife;

        float fadeIn = smoothstep(0.0, 0.08, lifeT);
        float fadeOut = 1.0 - smoothstep(0.35, 1.0, lifeT);
        vFade = fadeIn * fadeOut;
        vHeat = 1.0 - lifeT;

        vec3 animatedPosition = position;
        animatedPosition += aDrift * lifeT;

        vec3 transformed = animatedPosition;
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <worldpos_vertex>
        #include <clipping_planes_vertex>

        float distanceToCamera = length(mvPosition.xyz);
        float perspectiveScale = projectionMatrix[3][3] > 0.5 ? 0.25 : 1.0 / max(0.1, distanceToCamera);
        gl_PointSize = max(0.0, 8.0*aSize * lifeT * perspectiveScale);
      }
    `,
    fragmentShader: `
      varying float vFade;
      varying float vHeat;
      #include <clipping_planes_pars_fragment>

      void main() {
        #include <clipping_planes_fragment>
        vec2 centered = gl_PointCoord - vec2(0.5);
        float dist = length(centered);
        if (dist > 0.5) {
          discard;
        }

        float core = 1.0 - smoothstep(0.0, 0.28, dist);
        float edge = 1.0 - smoothstep(0.12, 0.5, dist);

        vec3 ember = vec3(1.0, 0.22, 0.02);
        vec3 flame = vec3(1.0, 0.55, 0.08);
        vec3 spark = vec3(1.0, 0.95, 0.55);
        vec3 color = mix(ember, flame, clamp(vHeat * 1.2, 0.0, 1.0));
        color = mix(color, spark, core);

        float alpha = edge * vFade;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  return { geometry, material };
};


const Explosion: Component<{
  time: number,
}> = (props) => {
  let maxTime = 1.0;
  let t = createMemo(() => props.time % maxTime);
  let radius = createMemo(() => t() * 2.0);
  let fire = createFire();
  onCleanup(() => {
    fire.geometry.dispose();
    fire.material.dispose();
  });
  createRenderEffect(
    () => props.time,
    (time) => {
      fire.material.uniforms.uTime.value = time;
    },
  );
  return (
    <T.Points
      geometry={fire.geometry}
      material={fire.material}
    />
  );
};

export default Explosion;
