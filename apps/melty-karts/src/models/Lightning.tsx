import { Component, createRenderEffect, onCleanup } from "solid-js";
import { T } from "../t";
import * as THREE from "three";
import { TSL, MeshBasicNodeMaterial } from "three/webgpu";
import { greaterThan, select } from "three/tsl";
const { uniform, varying, Fn, vec2, vec3, vec4, float, smoothstep, mix, length, dot, sin, cos, abs, fract, floor, positionLocal, positionGeometry, normalize, pow, sub, add, mul, div, max, min, negate, lessThanEqual, clamp, modelViewMatrix, cameraProjectionMatrix } = TSL;

const kBoltCount = 5.0;
const kSegmentsPerBolt = 16.0;

// Shared resources created once at module init
const _sharedBolts = (() => {
  const boltCount = 5;
  const segmentsPerBolt = 16;
  const boltVertexCount = segmentsPerBolt * 6;
  const vertexCount = boltCount * boltVertexCount;
  const boltSegmentEdgeSideIndices = new Float32Array(vertexCount * 3);
  let bufOffset = 0;
  const edgeSideIndex = 0;
  for (let boltIdx = 0; boltIdx < boltCount; ++boltIdx) {
    for (let segmentIdx = 0; segmentIdx < segmentsPerBolt; ++segmentIdx) {
      boltSegmentEdgeSideIndices[bufOffset++] = boltIdx;
      boltSegmentEdgeSideIndices[bufOffset++] = segmentIdx;
      boltSegmentEdgeSideIndices[bufOffset++] = edgeSideIndex;
      boltSegmentEdgeSideIndices[bufOffset++] = boltIdx;
      boltSegmentEdgeSideIndices[bufOffset++] = segmentIdx + 1;
      boltSegmentEdgeSideIndices[bufOffset++] = edgeSideIndex;
      boltSegmentEdgeSideIndices[bufOffset++] = boltIdx;
      boltSegmentEdgeSideIndices[bufOffset++] = segmentIdx + 1;
      boltSegmentEdgeSideIndices[bufOffset++] = edgeSideIndex + 1;
      boltSegmentEdgeSideIndices[bufOffset++] = boltIdx;
      boltSegmentEdgeSideIndices[bufOffset++] = segmentIdx;
      boltSegmentEdgeSideIndices[bufOffset++] = edgeSideIndex;
      boltSegmentEdgeSideIndices[bufOffset++] = boltIdx;
      boltSegmentEdgeSideIndices[bufOffset++] = segmentIdx + 1;
      boltSegmentEdgeSideIndices[bufOffset++] = edgeSideIndex + 1;
      boltSegmentEdgeSideIndices[bufOffset++] = boltIdx;
      boltSegmentEdgeSideIndices[bufOffset++] = segmentIdx;
      boltSegmentEdgeSideIndices[bufOffset++] = edgeSideIndex + 1;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(boltSegmentEdgeSideIndices, 3));

  const uTime = uniform(0);

  const hash11 = Fn(([p]: [any], builder: any) => {
    const v = mul(p, 0.1031).fract().toVar();
    v.assign(mul(v, add(v, 33.33)));
    v.assign(mul(v, add(v, v)));
    return v.fract();
  });

  const hash21 = Fn(([p]: [any], builder: any) => {
    const p3 = mul(vec3(p), vec3(0.1031, 0.1030, 0.0973)).fract().toVar();
    p3.assign(add(p3, dot(p3, add(p3.yzx, 33.33))));
    return sub(mul(mul(add(p3.xx, p3.yz), p3.zy).fract(), 2.0), 1.0);
  });

  const hash31 = Fn(([p]: [any], builder: any) => {
    const p3 = mul(vec3(p), vec3(0.1031, 0.11369, 0.13787)).fract().toVar();
    p3.assign(add(p3, dot(p3, add(p3.yxz, 19.19))));
    return sub(mul(vec3(
      mul(add(p3.x, p3.y), p3.z),
      mul(add(p3.x, p3.z), p3.y),
      mul(add(p3.y, p3.z), p3.x)
    ).fract(), 2.0), 1.0);
  });

  const animatedAnchor = Fn(([seed, base, amplitude, jumpRate, jitterRate, timeOffset]: [any, any, any, any, any, any], builder: any) => {
    const phaseTime = add(mul(uTime, jumpRate), timeOffset);
    const jumpIndex = floor(phaseTime);
    const jumpT = fract(phaseTime);
    const easedJumpT = smoothstep(0.0, 0.45, jumpT);

    const jumpA = hash31(add(mul(seed, 1.71), mul(jumpIndex, 13.0)));
    const jumpB = hash31(add(mul(seed, 1.71), mul(add(jumpIndex, 1.0), 13.0)));
    const jumpOffset = mul(mix(jumpA, jumpB, easedJumpT), amplitude);

    const microJitter = mul(vec3(
      sin(add(add(mul(uTime, mul(jitterRate, 1.9)), mul(seed, 2.1)), mul(jumpIndex, 0.7))),
      sin(add(add(mul(uTime, mul(jitterRate, 2.7)), mul(seed, 3.4)), mul(jumpIndex, 1.3))),
      cos(add(add(mul(uTime, mul(jitterRate, 2.2)), mul(seed, 4.6)), mul(jumpIndex, 0.9)))
    ), mul(amplitude, 0.18));

    return add(add(base, jumpOffset), microJitter);
  });

  const midpointOffset = Fn(([tVal, boltIdx, phaseSeed]: [any, any, any], builder: any) => {
    const leftT = float(0.0).toVar();
    const rightT = float(1.0).toVar();
    const leftOffset = vec2(0.0).toVar();
    const rightOffset = vec2(0.0).toVar();
    const amplitude = float(0.34).toVar();

    for (let level = 0; level < 4; ++level) {
      const intervalSeed = add(add(add(add(mul(boltIdx, 71.0), mul(phaseSeed, 131.0)), mul(float(level), 19.0)), mul(leftT, 173.0)), mul(rightT, 197.0));
      const midT = mul(add(leftT, rightT), 0.5);
      const randomOffset = mul(hash21(intervalSeed), amplitude);
      const midOffset = add(mul(add(leftOffset, rightOffset), 0.5), randomOffset);

      const cond = lessThanEqual(tVal, midT);
      rightT.assign(cond.select(midT, rightT));
      rightOffset.assign(cond.select(midOffset, rightOffset));
      leftT.assign(cond.select(leftT, midT));
      leftOffset.assign(cond.select(leftOffset, midOffset));

      amplitude.assign(mul(amplitude, 0.52));
    }

    const span = max(sub(rightT, leftT), 0.0001);
    const intervalT = clamp(div(sub(tVal, leftT), span), 0.0, 1.0);
    return mix(leftOffset, rightOffset, intervalT);
  });

  const boltPoint = Fn(([boltIdx, tVal, phaseSeed]: [any, any, any], builder: any) => {
    const boltPhase = div(boltIdx, max(1.0, sub(kBoltCount, 1.0)));
    const spread = mul(sub(boltPhase, 0.5), 1.5);
    const startSeed = mul(boltIdx, 11.0);
    const endSeed = mul(boltIdx, 23.0);

    const start = animatedAnchor(
      startSeed,
      vec3(mul(spread, 0.4), 0.0, mul(sub(hash11(startSeed), 0.5), 0.35)),
      vec3(0.32, 0.1, 0.3),
      7.5,
      18.0,
      mul(boltIdx, 1.7)
    );

    const end = animatedAnchor(
      endSeed,
      vec3(
        add(spread, mul(sub(hash11(endSeed), 0.5), 0.2)),
        add(1.45, mul(hash11(mul(boltIdx, 41.0)), 0.35)),
        mul(sub(hash11(mul(boltIdx, 59.0)), 0.5), 0.5)
      ),
      vec3(0.5, 0.32, 0.46),
      9.0,
      24.0,
      add(mul(boltIdx, 2.3), 2.3)
    );

    const clampedEndY = max(end.y, add(start.y, 0.75));
    end.y = clampedEndY;

    const centerLine = mix(start, end, tVal);
    const lateral = midpointOffset(tVal, boltIdx, phaseSeed);
    const envelope = pow(abs(sin(mul(tVal, 3.14159265))), 0.9);
    centerLine.xz = add(centerLine.xz, mul(lateral, envelope));

    const sineWarp = mul(sin(add(add(mul(tVal, 18.0), mul(phaseSeed, 0.45)), mul(boltIdx, 1.7))), 0.03);
    centerLine.x = add(centerLine.x, mul(sineWarp, envelope));

    return centerLine;
  });

  const boltIdx = positionGeometry.x;
  const t = div(positionGeometry.y, kSegmentsPerBolt);
  const edgeIdx = positionGeometry.z;

  const flashStep = floor(add(mul(uTime, 12.0), mul(boltIdx, 3.7)));
  const flashT = fract(add(mul(uTime, 12.0), mul(boltIdx, 0.17)));
  const pulse = mul(smoothstep(0.0, 0.12, flashT), sub(1.0, smoothstep(0.2, 0.95, flashT)));
  const phaseSeed = add(flashStep, mul(boltIdx, 17.0));

  const sampleStep = 1.0 / kSegmentsPerBolt;
  const prevT = max(0.0, sub(t, sampleStep));
  const nextT = min(1.0, add(t, sampleStep));

  const currentPoint = boltPoint(boltIdx, t, phaseSeed);
  const prevPoint = boltPoint(boltIdx, prevT, phaseSeed);
  const nextPoint = boltPoint(boltIdx, nextT, phaseSeed);

  // Transform to view space for screen-aligned normals (matching GLSL behavior)
  const mvCurrent = mul(modelViewMatrix, vec4(currentPoint, 1.0));
  const mvPrev = mul(modelViewMatrix, vec4(prevPoint, 1.0));
  const mvNext = mul(modelViewMatrix, vec4(nextPoint, 1.0));

  const screenDir = normalize(add(sub(mvNext.xy, mvPrev.xy), vec2(0.0001, 0.0)));
  const screenNormal = vec2(negate(screenDir.y), screenDir.x);

  const projCol3 = mul(cameraProjectionMatrix, vec4(0, 0, 0, 1));
  const projectionDiagonal = projCol3.w;
  const projectionType = greaterThan(projectionDiagonal, float(0.5));
  const boltWidthScale = select(projectionType, float(80.0), float(1.0));
  const boltWidth = mul(mul(mul(mix(0.08, 0.012, t), 0.3), add(mul(hash11(add(mul(boltIdx, 13.0), phaseSeed)), 0.35), 0.8)), boltWidthScale);
  const edgeFactor = sub(mul(edgeIdx, 2.0), 1.0);
  const mvCurrentOffset = vec4(add(mvCurrent.xy, mul(mul(screenNormal, edgeFactor), boltWidth)), mvCurrent.zw);
  const finalClip = mul(cameraProjectionMatrix, mvCurrentOffset);

  const vAcross = varying(edgeIdx);
  const vAlong = varying(t);
  const vGlow = varying(pulse);

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  material.vertexNode = finalClip;
  material.positionNode = currentPoint;

  const edgeFade = sub(1.0, smoothstep(0.15, 0.95, abs(mul(sub(vAcross, 0.5), 2.0))));
  const alongFade = mul(smoothstep(0.0, 0.08, vAlong), sub(1.0, smoothstep(0.78, 1.0, vAlong)));
  const core = pow(edgeFade, 3.5);
  const halo = vec3(0.15, 0.55, 1.0);
  const coreColour = vec3(0.95, 0.98, 1.0);
  const colour = mix(halo, coreColour, core);
  const alpha = mul(mul(add(0.2, mul(core, 0.9)), alongFade), add(mul(vGlow, 0.9), 0.35));

  material.colorNode = vec4(colour, 1.0);
  material.opacityNode = alpha;

  material.clippingPlanes = [];

  return {
    geometry,
    material,
    uTime,
  };
})();

const Lightning: Component<{
  time: number,
  clipped?: boolean,
}> = (props) => {
  // Clone material per-instance (outputNode safety for slot machine clip), share geometry + uTime
  const boltMaterial = _sharedBolts.material.clone();
  onCleanup(() => boltMaterial.dispose());
  createRenderEffect(
    () => props.time,
    (time) => {
      _sharedBolts.uTime.value = time;
    },
  );
  return (
    <T.Mesh
      geometry={_sharedBolts.geometry}
      material={boltMaterial}
      quaternion={new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0.0, 0.0, 1.0), Math.PI)}
      position={[0.0, 1.5, 0.0]}
      frustumCulled={false}
    />
  );
};

export default Lightning;
