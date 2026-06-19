import { Component, createMemo, createRenderEffect, onCleanup, Show } from "solid-js";
import * as THREE from "three";
import { TrackState } from "../components/track-component";
import { CatmullRomCurve4 } from "../catmull-rom-curve4";
import { TrackEvaluator } from "../track-evaluator";
import { T } from "../t";
import { attribute, div, Fn, fract, mix, uniform, vec3, vec4 } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";

const RenderTrack: Component<{
  ref: (self: THREE.Object3D) => void,
  track: TrackState,
  trackPtNodes: {
    pt: THREE.Vector3;
    twist: number;
    loopDaLoop: {
        diameter: number;
        exitOffset: number;
    } | undefined;
  }[],
  curve: {
    curve: CatmullRomCurve4;
    loopDaLoopRanges: {
        fromT: number;
        toT: number;
        centrePoint: THREE.Vector3;
    }[];
    length: number;
    trackEval: TrackEvaluator;
  },
  isSelected: boolean,
}> = (props) => {
  let geometries = createMemo(() => {
    let trackPtNodes2 = props.trackPtNodes;
    if (trackPtNodes2.length == 0) {
      return undefined;
    }
    let curve2 = props.curve;
    let numSamples = 400;
    let arcWeights: number[] = [0.0];
    {
      let atWeight = 0.0;
      let v4 = new THREE.Vector4();
      let lastPt = new THREE.Vector3();
      let pt = new THREE.Vector3();
      curve2.curve.getPoint(0, v4);
      lastPt.set(v4.x, v4.y, v4.z);
      for (let i = 1; i <= numSamples; ++i) {
        let t = i / numSamples;
        curve2.curve.getPoint(t, v4);
        pt.set(v4.x, v4.y, v4.z);
        let d = lastPt.distanceTo(pt);
        atWeight += d;
        arcWeights.push(atWeight);
        lastPt.copy(pt);
      }
      for (let i = 0; i < arcWeights.length; ++i) {
        arcWeights[i] /= atWeight;
      }
    }
    let remapTValueViaWeights = (x: number): number => {
      let lo = 0;
      let hi = arcWeights.length - 1;
      while (lo < hi - 1) {
        let mid = (lo + hi) >> 1;
        if (arcWeights[mid] < x) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      let a = arcWeights[lo];
      let b = arcWeights[hi];
      let t = (x - a) / (b - a);
      let c = lo / (arcWeights.length - 1);
      let d = hi / (arcWeights.length - 1);
      return c + t * (d - c);
    };
    let trackEval = props.curve.trackEval;
    let shape = new THREE.Shape();
    shape.moveTo(-0.5 * props.track.width, -0.3);
    shape.lineTo(0.5 * props.track.width, -0.3);
    shape.lineTo(0.5 * props.track.width, 0.0);
    shape.lineTo(-0.5 * props.track.width, 0.0);
    shape.closePath();
    let geometry = new THREE.ExtrudeGeometry(
      shape,
      {
        bevelEnabled: false,
        depth: curve2.length,
        steps: Math.ceil(curve2.length / 0.5),
      },
    );
    let points = geometry.getAttribute("position");
    let normals = geometry.getAttribute("normal");
    let originalZ = new Float32Array(points.count);
    for (let i = 0; i < points.count; ++i) {
      let z = points.getZ(i);
      originalZ[i] = z;
    }
    for (let i = 0; i < points.count; ++i) {
      let x = points.getX(i);
      let y = points.getY(i);
      let z = points.getZ(i);
      let nx = normals.getX(i);
      let ny = normals.getY(i);
      let nz = normals.getZ(i);
      let t = Math.max(0.0, Math.min(1.0, z / curve2.length));
      if (t === 1.0) {
        t = 0.0;
      }
      t = remapTValueViaWeights(t);
      let frame = trackEval.getFrameAt(t);
      let px = frame.position.x - frame.right.x * x + frame.up.x * y;
      let py = frame.position.y - frame.right.y * x + frame.up.y * y;
      let pz = frame.position.z - frame.right.z * x + frame.up.z * y;
      let nx2 = frame.right.x * nx + frame.up.x * ny + frame.forward.x * nz;
      let ny2 = frame.right.y * nx + frame.up.y * ny + frame.forward.y * nz;
      let nz2 = frame.right.z * nx + frame.up.z * ny + frame.forward.z * nz;
      points.setXYZ(i, px, py, pz);
      normals.setXYZ(i, nx2, ny2, nz2);
    }
    points.needsUpdate = true;
    normals.needsUpdate = true;
    geometry.setAttribute(
      "aOriginalZ",
      new THREE.BufferAttribute(originalZ, 1),
    );
    onCleanup(() => geometry.dispose());
    geometry.computeBoundingBox();
    
    const repeatInterval = uniform(10.0);
    const selectedUniform = uniform(props.isSelected ? 1.0 : 0.0);

    const hsv2rgb = Fn(([c]: [any], builder: any) => {
      const K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      const p = c.xxx.add(K.xyz).fract().mul(6.0).sub(K.www).abs();
      const clamped = p.sub(K.xxx).clamp(0.0, 1.0);
      return c.z.mul(mix(K.xxx, clamped, c.y));
    });

    const origZ = attribute<"float">("aOriginalZ", "float");
    const hue = fract(div(origZ, repeatInterval));
    const trackColor = hsv2rgb(vec3(hue, 0.9, 0.7));
    const finalColor = selectedUniform.greaterThan(0.5).select(
      vec3(0.0, 1.0, 0.0),
      trackColor,
    );

    const material = new MeshBasicNodeMaterial({
      transparent: true,
    });
    material.fragmentNode = vec4(finalColor, 0.8);
    onCleanup(() => material.dispose());
    
    // Star
    let starShape = new THREE.Shape();
    {
      let stepA = 2.0 * Math.PI / 10.0;
      let innerRadiusScale: number;
      {
        let i1 = -2;
        let i2 = 2;
        let j1 = 4;
        let j2 = 0;
        let l11x = Math.cos(stepA * i1);
        let l11y = Math.sin(stepA * i1);
        let l12x = Math.cos(stepA * i2);
        let l12y = Math.sin(stepA * i2);
        let l21x = Math.cos(stepA * j1);
        let l21y = Math.sin(stepA * j1);
        let l22x = Math.cos(stepA * j2);
        let l22y = Math.sin(stepA * j2);
        let rox = l11x;
        let roy = l11y;
        let rdx = l12x - l11x;
        let rdy = l12y - l11y;
        let dx = l22x - l21x;
        let dy = l22y - l21y;
        let nx = -dy;
        let ny = dx;
        let d = -nx * l21x - ny * l21y;
        // n.(ro + rd.t) + d = 0
        // n.ro + n.rd.t = -d
        // n.rd.t = -(d + n.ro)
        // t = -(d + n.ro) / (n.rd)
        let t = -(d + nx * rox + ny * roy) / (nx * rdx + ny * rdy);
        let px = rox + rdx * t;
        let py = roy + rdy * t;
        let r = Math.sqrt(px * px + py * py);
        innerRadiusScale = r;
      }
      let a = 0.5 * Math.PI;
      let radius = 0.5;
      for (let i = 0; i < 10; ++i) {
        let ca = Math.cos(a);
        let sa = Math.sin(a);
        let r = (i & 1) == 0 ? radius : innerRadiusScale * radius;
        let x = r * ca;
        let y = r * sa;
        if (i == 0) {
          starShape.moveTo(x, y);
        } else {
          starShape.lineTo(x, y);
        }
        a += stepA;
      }
      starShape.closePath();
      let holeShape = new THREE.Path();
      a = 0.5 * Math.PI;
      radius = 0.3;
      for (let i = 0; i < 10; ++i) {
        let ca = Math.cos(a);
        let sa = Math.sin(a);
        let r = (i & 1) == 0 ? radius : innerRadiusScale * radius;
        let x = r * ca;
        let y = r * sa;
        if (i == 0) {
          holeShape.moveTo(x, y);
        } else {
          holeShape.lineTo(x, y);
        }
        a += stepA;
      }
      holeShape.closePath();
      starShape.holes.push(holeShape);
    }
    let starGeometry = new THREE.ExtrudeGeometry(
      starShape,
      {
        depth: 0.1,
        bevelEnabled: false,
      },
    );
    starGeometry.rotateY(0.5 * Math.PI);
    let starRailGeometry = new THREE.BufferGeometry();
    {
      let starPositions = starGeometry.getAttribute("position");
      let starNormals = starGeometry.getAttribute("normal")!;
      let numStars = Math.ceil(curve2.length / 0.9);
      let numPointsPerStar = starPositions.count;
      let numVerts = 2 * numStars * numPointsPerStar;
      let positions = new Float32Array(numVerts * 3);
      let normalsArray = new Float32Array(numVerts * 3);

      let starPX = new Float32Array(numPointsPerStar);
      let starPY = new Float32Array(numPointsPerStar);
      let starPZ = new Float32Array(numPointsPerStar);
      let starNX = new Float32Array(numPointsPerStar);
      let starNY = new Float32Array(numPointsPerStar);
      let starNZ = new Float32Array(numPointsPerStar);
      for (let j = 0; j < numPointsPerStar; ++j) {
        starPX[j] = starPositions.getX(j);
        starPY[j] = starPositions.getY(j);
        starPZ[j] = starPositions.getZ(j);
        starNX[j] = starNormals.getX(j);
        starNY[j] = starNormals.getY(j);
        starNZ[j] = starNormals.getZ(j);
      }

      let halfWidth = 0.5 * props.track.width;
      let at3 = 0;
      for (let i = 0; i < numStars; ++i) {
        let zBase = i * 0.9;
        for (let j = 0; j < numPointsPerStar; ++j) {
          positions[at3] = starPX[j] - halfWidth;
          positions[at3 + 1] = starPY[j] + 0.4;
          positions[at3 + 2] = starPZ[j] + zBase;
          normalsArray[at3] = starNX[j];
          normalsArray[at3 + 1] = starNY[j];
          normalsArray[at3 + 2] = starNZ[j];
          at3 += 3;
        }
        for (let j = 0; j < numPointsPerStar; ++j) {
          positions[at3] = starPX[j] + halfWidth;
          positions[at3 + 1] = starPY[j] + 0.4;
          positions[at3 + 2] = starPZ[j] + zBase;
          normalsArray[at3] = starNX[j];
          normalsArray[at3 + 1] = starNY[j];
          normalsArray[at3 + 2] = starNZ[j];
          at3 += 3;
        }
      }
      starRailGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      starRailGeometry.setAttribute("normal", new THREE.BufferAttribute(normalsArray, 3));
    }
    {
      let points = starRailGeometry.getAttribute("position");
      let normals = starRailGeometry.getAttribute("normal");
      for (let i = 0; i < points.count; ++i) {
        let x = points.getX(i);
        let y = points.getY(i);
        let z = points.getZ(i);
        let nx = normals.getX(i);
        let ny = normals.getY(i);
        let nz = normals.getZ(i);
        let t = Math.max(0.0, Math.min(1.0, z / curve2.length));
        if (t === 1.0) {
          t = 0.0;
        }
        t = remapTValueViaWeights(t);
        let frame = trackEval.getFrameAt(t);
        let px = frame.position.x - frame.right.x * x + frame.up.x * y;
        let py = frame.position.y - frame.right.y * x + frame.up.y * y;
        let pz = frame.position.z - frame.right.z * x + frame.up.z * y;
        let nx2 = frame.right.x * nx + frame.up.x * ny + frame.forward.x * nz;
        let ny2 = frame.right.y * nx + frame.up.y * ny + frame.forward.y * nz;
        let nz2 = frame.right.z * nx + frame.up.z * ny + frame.forward.z * nz;
        points.setXYZ(i, px, py, pz);
        normals.setXYZ(i, nx2, ny2, nz2);
      }
      points.needsUpdate = true;
      normals.needsUpdate = true;
    }
    onCleanup(() => {
      starGeometry.dispose();
      starRailGeometry.dispose();
    });
    return {
      geometry,
      material,
      starRailGeometry,
    };
  });
  let matRef: THREE.MeshBasicMaterial | undefined;
  createRenderEffect(
    () => props.isSelected,
    (isSelected) => {
      let shaderData = matRef?.userData?.shaderData as
        | { uniforms: Record<string, { value: unknown }> }
        | undefined;
      if (shaderData?.uniforms?.uSelected) {
        shaderData.uniforms.uSelected.value = isSelected ? 1.0 : 0.0;
      }
    },
  );
  return (
    <Show when={geometries()}>
      {(geometries) => (
        <>
          <T.Mesh
            geometry={geometries().starRailGeometry}
          >
            <T.MeshStandardMaterial
              color="yellow"
            />
          </T.Mesh>
          <T.Mesh
            geometry={geometries().geometry}
            ref={props.ref}
            material={geometries().material}
          />
        </>
      )}

    </Show>
  );
};

export default RenderTrack;
