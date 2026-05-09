import { Component, createRenderEffect, onCleanup } from "solid-js";
import { T } from "../t";
import * as THREE from "three";

const createBolts = () => {
  const boltCount = 5;
  const segmentsPerBolt = 16;
  const boltVertexCount = segmentsPerBolt * 6;
  const vertexCount = boltCount * boltVertexCount;
  const boltSegmentEdgeSideIndices = new Float32Array(vertexCount * 3);
  let offset = 0;
  const edgeSideIndex = 0;
  for (let boltIdx = 0; boltIdx < boltCount; ++boltIdx) {
    for (let segmentIdx = 0; segmentIdx < segmentsPerBolt; ++segmentIdx) {
      //
      boltSegmentEdgeSideIndices[offset++] = boltIdx;
      boltSegmentEdgeSideIndices[offset++] = segmentIdx;
      boltSegmentEdgeSideIndices[offset++] = edgeSideIndex;
      //
      boltSegmentEdgeSideIndices[offset++] = boltIdx;
      boltSegmentEdgeSideIndices[offset++] = segmentIdx + 1;
      boltSegmentEdgeSideIndices[offset++] = edgeSideIndex;
      //
      boltSegmentEdgeSideIndices[offset++] = boltIdx;
      boltSegmentEdgeSideIndices[offset++] = segmentIdx + 1;
      boltSegmentEdgeSideIndices[offset++] = edgeSideIndex + 1;
      //
      boltSegmentEdgeSideIndices[offset++] = boltIdx;
      boltSegmentEdgeSideIndices[offset++] = segmentIdx;
      boltSegmentEdgeSideIndices[offset++] = edgeSideIndex;
      //
      boltSegmentEdgeSideIndices[offset++] = boltIdx;
      boltSegmentEdgeSideIndices[offset++] = segmentIdx + 1;
      boltSegmentEdgeSideIndices[offset++] = edgeSideIndex + 1;
      //
      boltSegmentEdgeSideIndices[offset++] = boltIdx;
      boltSegmentEdgeSideIndices[offset++] = segmentIdx;
      boltSegmentEdgeSideIndices[offset++] = edgeSideIndex + 1;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(boltSegmentEdgeSideIndices, 3));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0, },
    },
    vertexShader: `
      uniform float uTime;

      varying float vAcross;
      varying float vAlong;
      varying float vGlow;
      #include <clipping_planes_pars_vertex>

      const float kBoltCount = 5.0;
      const float kSegmentsPerBolt = 16.0;
      float hash11(float p) {
        p = fract(p * 0.1031);
        p *= p + 33.33;
        p *= p + p;
        return fract(p);
      }

      vec2 hash21(float p) {
        vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
      }

      vec3 hash31(float p) {
        vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.11369, 0.13787));
        p3 += dot(p3, p3.yxz + 19.19);
        return fract(vec3(
          (p3.x + p3.y) * p3.z,
          (p3.x + p3.z) * p3.y,
          (p3.y + p3.z) * p3.x
        )) * 2.0 - 1.0;
      }

      vec3 animatedAnchor(float seed, vec3 base, vec3 amplitude, float jumpRate, float jitterRate, float timeOffset) {
        float phaseTime = uTime * jumpRate + timeOffset;
        float jumpIndex = floor(phaseTime);
        float jumpT = fract(phaseTime);
        float easedJumpT = smoothstep(0.0, 0.45, jumpT);

        vec3 jumpA = hash31(seed * 1.71 + jumpIndex * 13.0);
        vec3 jumpB = hash31(seed * 1.71 + (jumpIndex + 1.0) * 13.0);
        vec3 jumpOffset = mix(jumpA, jumpB, easedJumpT) * amplitude;

        vec3 microJitter = vec3(
          sin(uTime * (jitterRate * 1.9) + seed * 2.1 + jumpIndex * 0.7),
          sin(uTime * (jitterRate * 2.7) + seed * 3.4 + jumpIndex * 1.3),
          cos(uTime * (jitterRate * 2.2) + seed * 4.6 + jumpIndex * 0.9)
        ) * (amplitude * 0.18);

        return base + jumpOffset + microJitter;
      }

      vec2 midpointOffset(float t, float boltIdx, float phaseSeed) {
        float leftT = 0.0;
        float rightT = 1.0;
        vec2 leftOffset = vec2(0.0);
        vec2 rightOffset = vec2(0.0);
        float amplitude = 0.34;

        for (int level = 0; level < 4; ++level) {
          float intervalSeed = boltIdx * 71.0 + phaseSeed * 131.0 + float(level) * 19.0 + leftT * 173.0 + rightT * 197.0;
          float midT = 0.5 * (leftT + rightT);
          vec2 randomOffset = hash21(intervalSeed) * amplitude;
          vec2 midOffset = 0.5 * (leftOffset + rightOffset) + randomOffset;

          if (t <= midT) {
            rightT = midT;
            rightOffset = midOffset;
          } else {
            leftT = midT;
            leftOffset = midOffset;
          }

          amplitude *= 0.52;
        }

        float span = max(0.0001, rightT - leftT);
        float intervalT = clamp((t - leftT) / span, 0.0, 1.0);
        return mix(leftOffset, rightOffset, intervalT);
      }

      vec3 boltPoint(float boltIdx, float t, float phaseSeed) {
        float boltPhase = boltIdx / max(1.0, kBoltCount - 1.0);
        float spread = (boltPhase - 0.5) * 1.5;
        float startSeed = boltIdx * 11.0;
        float endSeed = boltIdx * 23.0;
        vec3 start = animatedAnchor(
          startSeed,
          vec3(spread*0.4, 0.0, (hash11(startSeed) - 0.5) * 0.35),
          vec3(0.32, 0.1, 0.3),
          7.5,
          18.0,
          boltIdx * 1.7
        );
        vec3 end = animatedAnchor(
          endSeed,
          vec3(
            spread + (hash11(endSeed) - 0.5) * 0.2,
            1.45 + hash11(boltIdx * 41.0) * 0.35,
            (hash11(boltIdx * 59.0) - 0.5) * 0.5
          ),
          vec3(0.5, 0.32, 0.46),
          9.0,
          24.0,
          boltIdx * 2.3 + 2.3
        );
        end.y = max(end.y, start.y + 0.75);

        vec3 centerLine = mix(start, end, t);
        vec2 lateral = midpointOffset(t, boltIdx, phaseSeed);
        float envelope = pow(sin(t * 3.14159265), 0.9);
        centerLine.xz += lateral * envelope;

        float sineWarp = sin((t * 18.0) + phaseSeed * 0.45 + boltIdx * 1.7) * 0.03;
        centerLine.x += sineWarp * envelope;

        return centerLine;
      }

      void main() {
        float boltIdx = position.x;
        float t = position.y / kSegmentsPerBolt;
        float edgeIdx = position.z;

        float flashStep = floor(uTime * 12.0 + boltIdx * 3.7);
        float flashT = fract(uTime * 12.0 + boltIdx * 0.17);
        float pulse = smoothstep(0.0, 0.12, flashT) * (1.0 - smoothstep(0.2, 0.95, flashT));
        float phaseSeed = flashStep + boltIdx * 17.0;

        float sampleStep = 1.0 / kSegmentsPerBolt;
        float prevT = max(0.0, t - sampleStep);
        float nextT = min(1.0, t + sampleStep);

        vec3 currentPoint = boltPoint(boltIdx, t, phaseSeed);
        vec3 prevPoint = boltPoint(boltIdx, prevT, phaseSeed);
        vec3 nextPoint = boltPoint(boltIdx, nextT, phaseSeed);

        vec4 mvCurrent = modelViewMatrix * vec4(currentPoint, 1.0);
        vec4 mvPrev = modelViewMatrix * vec4(prevPoint, 1.0);
        vec4 mvNext = modelViewMatrix * vec4(nextPoint, 1.0);

        vec2 screenDir = normalize((mvNext.xy - mvPrev.xy) + vec2(0.0001, 0.0));
        vec2 screenNormal = vec2(-screenDir.y, screenDir.x);

        float boltWidth = 0.3*mix(0.08, 0.012, t);
        boltWidth *= 0.8 + 0.35 * hash11(boltIdx * 13.0 + phaseSeed);
        mvCurrent.xy += screenNormal * ((edgeIdx * 2.0) - 1.0) * boltWidth;

        vAcross = edgeIdx;
        vAlong = t;
        vGlow = pulse;
        vClipPosition = -mvCurrent.xyz;

        gl_Position = projectionMatrix * mvCurrent;
      }
    `,
    fragmentShader: `
      varying float vAcross;
      varying float vAlong;
      varying float vGlow;
      #include <clipping_planes_pars_fragment>

      void main() {
        vec4 diffuseColor = vec4(1.0);
        #include <clipping_planes_fragment>
        float edgeFade = 1.0 - smoothstep(0.15, 0.95, abs(vAcross - 0.5) * 2.0);
        float alongFade = smoothstep(0.0, 0.08, vAlong) * (1.0 - smoothstep(0.78, 1.0, vAlong));
        float core = pow(edgeFade, 3.5);
        vec3 halo = vec3(0.15, 0.55, 1.0);
        vec3 coreColour = vec3(0.95, 0.98, 1.0);
        vec3 colour = mix(halo, coreColour, core);
        float alpha = (0.2 + core * 0.9) * alongFade * (0.35 + vGlow * 0.9);
        gl_FragColor = vec4(colour, alpha);
      }
    `,
  });
  return {
    geometry,
    material,
  };
};

const Lightning: Component<{
  time: number,
}> = (props) => {
  const bolts = createBolts();
  onCleanup(() => {
    bolts.geometry.dispose();
    bolts.material.dispose();
  });
  createRenderEffect(
    () => props.time,
    (time) => {
      bolts.material.uniforms.uTime.value = time;
    },
  );
  return (
    <T.Mesh
      geometry={bolts.geometry}
      material={bolts.material}
      quaternion={new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0.0, 0.0, 1.0), Math.PI)}
      position={[0.0, 1.5, 0.0]}
      frustumCulled={false}
    />
  );
};

export default Lightning;
