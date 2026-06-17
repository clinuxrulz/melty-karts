import * as THREE from 'three';
import { CatmullRomCurve4 } from './catmull-rom-curve4';

export interface TrackFrame {
  position: THREE.Vector3;
  forward: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
}

export class TrackEvaluator {
  private curve: CatmullRomCurve4;
  private loopDaLoopRanges: { fromT: number, toT: number, centrePoint: THREE.Vector3, }[];

  constructor(
    curve: CatmullRomCurve4,
    loopDaLoopRanges: { fromT: number, toT: number, centrePoint: THREE.Vector3, }[],
  ) {
    this.curve = curve;
    this.loopDaLoopRanges = loopDaLoopRanges;
  }

  public getFrameAt(t: number): TrackFrame {
    let loopDaLoopCentrePoint: THREE.Vector3 | undefined;
    for (let loopDaLoopRange of this.loopDaLoopRanges) {
      if (loopDaLoopRange.fromT <= t && t <= loopDaLoopRange.toT) {
        loopDaLoopCentrePoint = loopDaLoopRange.centrePoint;
        break;
      }
    }
    let t1 = t;
    let t2 = t + 0.01;
    if (t2 > 1.0) {
      t2 -= 1.0;
    }
    let pt = this.curve.getPoint(t1);
    let twist = pt.w;
    let pt1 = new THREE.Vector3().copy(pt);
    let pt2 = new THREE.Vector3().copy(this.curve.getPoint(t2));
    let position = pt1;
    let forward = pt2.sub(pt1).normalize();
    let up: THREE.Vector3;
    if (loopDaLoopCentrePoint !== undefined) {
      up = new THREE.Vector3().subVectors(loopDaLoopCentrePoint, position).normalize();
    } else {
      up = new THREE.Vector3(0.0, 1.0, 0.0);
    }
    let right = new THREE.Vector3().crossVectors(forward, up).normalize();
    up.crossVectors(right, forward);
    up.applyAxisAngle(forward, twist);
    right.applyAxisAngle(forward, twist);
    return { position, forward, up, right, };
  }
}
