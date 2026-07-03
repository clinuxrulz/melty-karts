import * as THREE from "three";
import { CatmullRomCurve4 } from "./catmull-rom-curve4";
import { TrackEvaluator } from "./track-evaluator";
import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { EntityID } from "@oasys/oecs";
import { entityGetComponentData } from "./util";
import { ComponentRegistry } from "./components/registry";

export function obtainTrackPtNodes(params: {
  componentRegistry: ComponentRegistry,
  ecs: ReactiveECS,
  trackId: EntityID
}): {
  pt: THREE.Vector3;
  twist: number;
  loopDaLoop: {
      diameter: number;
      exitOffset: number;
  } | undefined;
  spiral: {
      radius: number;
      totalAngle: number;
      exitOffset: number;
  } | undefined;
}[] | undefined {
  let componentRegistry = params.componentRegistry;
  let parent = entityGetComponentData(params.ecs, params.trackId, componentRegistry.Parent);
  if (parent === undefined) {
    return undefined;
  }
  let head = parent.head as EntityID | -1;
  if (head === -1) {
    return undefined;
  }
  let result: {
    pt: THREE.Vector3,
    twist: number,
    loopDaLoop: {
      diameter: number,
      exitOffset: number,
    } | undefined,
    spiral: {
      radius: number,
      totalAngle: number,
      exitOffset: number,
    } | undefined,
  }[] = [];
  let at = head;
  while (true) {
    let node = params.ecs.entity(at);
    if (node === undefined) {
      break;
    }
    if (!node.hasComponent(componentRegistry.Child)) {
      break;
    }
    let next = node.getField(componentRegistry.Child, "next") as EntityID | -1;
    if (node.hasComponent(componentRegistry.TrackPathPt)) {
      let pt = new THREE.Vector3(
        node.getField(componentRegistry.TrackPathPt, "px"),
        node.getField(componentRegistry.TrackPathPt, "py"),
        node.getField(componentRegistry.TrackPathPt, "pz"),
      );
      let twist = node.getField(componentRegistry.TrackPathPt, "twist");
      let loopDaLoop: {
        diameter: number,
        exitOffset: number,
      } | undefined;
      if (node.hasComponent(componentRegistry.LoopDaLoop)) {
        let diameter = node.getField(componentRegistry.LoopDaLoop, "diameter");
        let exitOffset = node.getField(componentRegistry.LoopDaLoop, "exitOffset");
        loopDaLoop = {
          diameter,
          exitOffset,
        };
      } else {
        loopDaLoop = undefined;
      }
      let spiral: {
        radius: number,
        totalAngle: number,
        exitOffset: number,
      } | undefined;
      if (node.hasComponent(componentRegistry.Spiral)) {
        let radius = node.getField(componentRegistry.Spiral, "radius");
        let totalAngle = node.getField(componentRegistry.Spiral, "totalAngle");
        let exitOffset = node.getField(componentRegistry.Spiral, "exitOffset");
        spiral = {
          radius,
          totalAngle,
          exitOffset,
        };
      } else {
        spiral = undefined;
      }
      result.push({
        pt,
        twist,
        loopDaLoop,
        spiral,
      });
    }
    if (next === -1) {
      break;
    }
    at = next;
  }
  if (result.length === 0) {
    return undefined;
  }
  return result;
}

export function generateTrackCurve(params: {
  trackPtNodes: {
    pt: THREE.Vector3;
    twist: number;
    loopDaLoop: {
        diameter: number;
        exitOffset: number;
    } | undefined;
    spiral: {
        radius: number;
        totalAngle: number;
        exitOffset: number;
    } | undefined;
  }[],
}) {
  let trackPtNodes = params.trackPtNodes;
  let curve = new CatmullRomCurve4(
    trackPtNodes.map(({ pt, twist }) => new THREE.Vector4(pt.x, pt.y, pt.z, twist)),
    true,
  );
  let additionalPoints: { afterIdx: number, centre: THREE.Vector3, right: THREE.Vector3, pts: THREE.Vector4[], }[] = [];
  let spiralAdditionalPoints: { afterIdx: number, centre: THREE.Vector3, pts: THREE.Vector4[], }[] = [];
  for (let i = 0; i < trackPtNodes.length; ++i) {
    let pt = trackPtNodes[i].pt;
    let loopDaLoop = trackPtNodes[i].loopDaLoop;
    let spiral = trackPtNodes[i].spiral;
    if (loopDaLoop !== undefined) {
      let t1 = (i - 0.5) / trackPtNodes.length;
      if (t1 < 0.0) {
        t1 += 1.0;
      }
      let t2 = t1 + 0.01;
      if (t2 > 1.0) {
        t2 -= 1.0;
      }
      let pt1 = curve.getPoint(t1);
      let pt2 = curve.getPoint(t2);
      let forward = new THREE.Vector3().subVectors(pt2, pt1).normalize();
      let up = new THREE.Vector3(0.0, 1.0, 0.0);
      let right = new THREE.Vector3().crossVectors(forward, up).normalize();
      up.crossVectors(right, forward);
      let entry: { afterIdx: number, centre: THREE.Vector3, right: THREE.Vector3, pts: THREE.Vector4[], } = {
        afterIdx: i,
        centre: new THREE.Vector3(
          pt.x + 0.5 * loopDaLoop.diameter * up.x,
          pt.y + 0.5 * loopDaLoop.diameter * up.y,
          pt.z + 0.5 * loopDaLoop.diameter * up.z,
        ),
        right: right.clone(),
        pts: [],
      };
      let numLoopSegments = 10;
      for (let j = 1; j < numLoopSegments; ++j) {
        let a = j * 2.0 * Math.PI / numLoopSegments;
        let ca = Math.cos(a);
        let sa = Math.sin(a);
        let lx = 0.5 * loopDaLoop.diameter * sa;
        let ly = 0.5 * loopDaLoop.diameter * (1-ca);
        let lz = j * loopDaLoop.exitOffset / numLoopSegments;
        let pt2 = new THREE.Vector4(
          pt.x + lx * forward.x + ly * up.x + lz * right.x,
          pt.y + lx * forward.y + ly * up.y + lz * right.y,
          pt.z + lx * forward.z + ly * up.z + lz * right.z,
          0.0,
        );
        entry.pts.push(pt2);
      }
      additionalPoints.push(entry);
    }
    if (spiral !== undefined) {
      let t1 = (i - 0.5) / trackPtNodes.length;
      if (t1 < 0.0) {
        t1 += 1.0;
      }
      let t2 = t1 + 0.01;
      if (t2 > 1.0) {
        t2 -= 1.0;
      }
      let pt1 = curve.getPoint(t1);
      let pt2 = curve.getPoint(t2);
      let forward = new THREE.Vector3().subVectors(pt2, pt1).normalize();
      let up = new THREE.Vector3(0.0, 1.0, 0.0);
      let right = new THREE.Vector3().crossVectors(forward, up).normalize();
      up.crossVectors(right, forward);
      let centre = new THREE.Vector3(
        pt.x - spiral.radius * right.x,
        pt.y - spiral.radius * right.y,
        pt.z - spiral.radius * right.z,
      );
      let entry: { afterIdx: number, centre: THREE.Vector3, pts: THREE.Vector4[], } = {
        afterIdx: i,
        centre: centre.clone(),
        pts: [],
      };
      let numSpiralSegments = 16;
      for (let j = 1; j < numSpiralSegments; ++j) {
        let a = j * spiral.totalAngle / numSpiralSegments;
        let ca = Math.cos(a);
        let sa = Math.sin(a);
        let lx = spiral.radius * sa;
        let ly = spiral.radius * ca;
        let lz = j * spiral.exitOffset / numSpiralSegments;
        let pt2 = new THREE.Vector4(
          centre.x + ly * right.x + lx * forward.x + lz * up.x,
          centre.y + ly * right.y + lx * forward.y + lz * up.y,
          centre.z + ly * right.z + lx * forward.z + lz * up.z,
          0.0,
        );
        entry.pts.push(pt2);
      }
      spiralAdditionalPoints.push(entry);
    }
  }
  let loopDaLoopRanges: { fromT: number, toT: number, centrePoint: THREE.Vector3, right: THREE.Vector3, }[] = [];
  if (additionalPoints.length !== 0) {
    let trackPts: {
      value: THREE.Vector4,
      loopDaLoopIdx: number | undefined,
    }[] = trackPtNodes
      .map(({ pt, twist }) => new THREE.Vector4(pt.x, pt.y, pt.z, twist))
      .flatMap((value, idx) => {
        let extraPointsIndex = additionalPoints.findIndex(({ afterIdx }) => afterIdx === idx);
        if (extraPointsIndex == -1) {
          return [ { value, loopDaLoopIdx: undefined, }, ];
        }
        let extraPoints = additionalPoints[extraPointsIndex].pts;
        return [
          { value, loopDaLoopIdx: undefined, },
          ...extraPoints.map((x) => ({ value: x, loopDaLoopIdx: extraPointsIndex, })),
        ];
      });
    curve = new CatmullRomCurve4(
      trackPts.map((x) => x.value),
      true,
    );
    let loopDaLoopIndexToRangeMap = new Map<number,{ fromT: number, toT: number, centrePoint: THREE.Vector3, right: THREE.Vector3 }>();
    for (let i = 0; i < trackPts.length; ++i) {
      let trackPt = trackPts[i];
      if (trackPt.loopDaLoopIdx === undefined) {
        continue;
      }
      let loopDaLoopIdx = trackPt.loopDaLoopIdx;
      let atT = i / trackPts.length;
      let entry = loopDaLoopIndexToRangeMap.get(loopDaLoopIdx);
      if (entry === undefined) {
        entry = {
          fromT: atT,
          toT: atT,
          centrePoint: additionalPoints[loopDaLoopIdx].centre,
          right: additionalPoints[loopDaLoopIdx].right,
        };
        loopDaLoopIndexToRangeMap.set(loopDaLoopIdx, entry);
      } else {
        entry.fromT = Math.min(entry.fromT, atT);
        entry.toT = Math.max(entry.toT, atT);
      }
    }
    for (let x of loopDaLoopIndexToRangeMap.values()) {
      loopDaLoopRanges.push(x);
    }
  }
  let spiralRanges: { fromT: number, toT: number, centrePoint: THREE.Vector3 }[] = [];
  if (spiralAdditionalPoints.length !== 0) {
    let trackPts: {
      value: THREE.Vector4,
      spiralIdx: number | undefined,
    }[] = trackPtNodes
      .map(({ pt, twist }) => new THREE.Vector4(pt.x, pt.y, pt.z, twist))
      .flatMap((value, idx) => {
        let extraPointsIndex = spiralAdditionalPoints.findIndex(({ afterIdx }) => afterIdx === idx);
        if (extraPointsIndex == -1) {
          return [ { value, spiralIdx: undefined, }, ];
        }
        let extraPoints = spiralAdditionalPoints[extraPointsIndex].pts;
        return [
          { value, spiralIdx: undefined, },
          ...extraPoints.map((x) => ({ value: x, spiralIdx: extraPointsIndex, })),
        ];
      });
    curve = new CatmullRomCurve4(
      trackPts.map((x) => x.value),
      true,
    );
    let spiralIndexToRangeMap = new Map<number,{ fromT: number, toT: number, centrePoint: THREE.Vector3 }>();
    for (let i = 0; i < trackPts.length; ++i) {
      let trackPt = trackPts[i];
      if (trackPt.spiralIdx === undefined) {
        continue;
      }
      let spiralIdx = trackPt.spiralIdx;
      let atT = i / trackPts.length;
      let entry = spiralIndexToRangeMap.get(spiralIdx);
      if (entry === undefined) {
        entry = {
          fromT: atT,
          toT: atT,
          centrePoint: spiralAdditionalPoints[spiralIdx].centre,
        };
        spiralIndexToRangeMap.set(spiralIdx, entry);
      } else {
        entry.fromT = Math.min(entry.fromT, atT);
        entry.toT = Math.max(entry.toT, atT);
      }
    }
    for (let x of spiralIndexToRangeMap.values()) {
      spiralRanges.push(x);
    }
  }
  let length = 0.0;
  let v4 = new THREE.Vector4();
  let lastPt = new THREE.Vector3();
  let pt = new THREE.Vector3();
  curve.getPoint(0, v4);
  lastPt.set(v4.x, v4.y, v4.z);
  for (let i = 1; i < 1000; ++i) {
    let t = i / 999.0;
    curve.getPoint(t, v4);
    pt.set(v4.x, v4.y, v4.z);
    let dist = lastPt.distanceTo(pt);
    length += dist;
    lastPt.set(pt.x, pt.y, pt.z);
  }
  let trackEval = new TrackEvaluator(
    curve,
    loopDaLoopRanges,
  );
  return {
    curve,
    loopDaLoopRanges,
    spiralRanges,
    length,
    trackEval,
  };
}
