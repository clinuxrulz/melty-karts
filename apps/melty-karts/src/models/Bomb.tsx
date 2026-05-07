import { Component, createRenderEffect, onCleanup, onSettled } from "solid-js";
import { useFrame } from "solid-three";
import { T } from "../t";

import * as THREE from "three";

const createWickFire = () => {
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

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aDrift", new THREE.BufferAttribute(drift, 3));
  geometry.setAttribute("aLife", new THREE.BufferAttribute(life, 1));
  geometry.setAttribute("aOffset", new THREE.BufferAttribute(offset, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geometry.setAttribute("aSpin", new THREE.BufferAttribute(spin, 1));

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
      attribute float aSpin;

      varying float vFade;
      varying float vHeat;

      void main() {
        float age = mod(uTime + aOffset, aLife);
        float lifeT = age / aLife;

        float fadeIn = smoothstep(0.0, 0.08, lifeT);
        float fadeOut = 1.0 - smoothstep(0.35, 1.0, lifeT);
        vFade = fadeIn * fadeOut;
        vHeat = 1.0 - lifeT;

        float swirl = sin((uTime * 10.0) + aSpin + (lifeT * 12.0)) * 0.012 * (1.0 - lifeT);
        float flicker = sin((uTime * 24.0) + aSpin) * 0.004;

        vec3 animatedPosition = position;
        animatedPosition += aDrift * lifeT;
        animatedPosition.x += swirl;
        animatedPosition.y += (lifeT * lifeT) * 0.12 + flicker;
        animatedPosition.z += cos((uTime * 8.0) + aSpin + (lifeT * 10.0)) * 0.006 * (1.0 - lifeT);

        vec4 mvPosition = modelViewMatrix * vec4(animatedPosition, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        float distanceToCamera = length(mvPosition.xyz);
        float perspectiveScale = 1.0 / max(0.1, distanceToCamera);
        gl_PointSize = max(0.0, aSize * vFade * perspectiveScale);
      }
    `,
    fragmentShader: `
      varying float vFade;
      varying float vHeat;

      void main() {
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
  let material = new THREE.MeshStandardMaterial({
    color: "#6e6e6e",
  });
  onCleanup(() => material.dispose());
  let wickShape = new THREE.Shape();
  wickShape.absellipse(
    0.0,
    0.0,
    0.01,
    0.01,
    0.0,
    2.0 * Math.PI,
  );
  let wickPath = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0.0, 0.0, 0.0),
      new THREE.Vector3(0.0, 0.1, 0.0),
      new THREE.Vector3(0.1, 0.15, 0.0),
      new THREE.Vector3(0.12, 0.2, 0.0),
    ],
  );
  const wickFire = createWickFire();
  onCleanup(() => {
    wickFire.geometry.dispose();
    wickFire.material.dispose();
  });
  createRenderEffect(
    () => props.time,
    (time) => {
      wickFire.material.uniforms.uTime.value = time;
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
              wickShape,
              {
                steps: 20,
                bevelEnabled: false,
                extrudePath: wickPath,
              },
            ]}
          />
          <T.MeshStandardMaterial
            color="#ffffff"
          />
        </T.Mesh>
        <T.Points
          position={[0.12, 0.55, 0.0]}
          quaternion={qi}
          geometry={wickFire.geometry}
          material={wickFire.material}
        />
      </T.Group>
    </T.Group>
  );
};

export default Bomb;
