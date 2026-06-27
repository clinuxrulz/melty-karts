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
  private loopDaLoopRanges: { fromT: number, toT: number, centrePoint: THREE.Vector3, right: THREE.Vector3 }[];
  private sampleFrames: TrackFrame[];

  constructor(
    curve: CatmullRomCurve4,
    loopDaLoopRanges: { fromT: number, toT: number, centrePoint: THREE.Vector3, right: THREE.Vector3 }[],
    numSamples: number = 400,
  ) {
    this.curve = curve;
    this.loopDaLoopRanges = loopDaLoopRanges;
    this.sampleFrames = [];
    this.computeFrames(numSamples);
  }

  private computeFrames(numSamples: number): void {
    let loopRanges = this.loopDaLoopRanges;
    const transitionWidth = 0.03;
    for (let i = 0; i <= numSamples; i++) {
      let t = i / numSamples;

      let v4 = this.curve.getPoint(t);
      let position = new THREE.Vector3(v4.x, v4.y, v4.z);
      let twist = v4.w;

      let t2 = t + 0.01;
      if (t2 > 1.0) {
        t2 -= 1.0;
      }
      let v4b = this.curve.getPoint(t2);
      let forward = new THREE.Vector3(v4b.x, v4b.y, v4b.z).sub(position).normalize();

      let loopBlend = 0;
      let loopRange: { fromT: number, toT: number, centrePoint: THREE.Vector3, right: THREE.Vector3 } | undefined;
      for (let range of loopRanges) {
        if (range.fromT <= t && t <= range.toT) {
          loopBlend = 1;
          loopRange = range;
          break;
        }
      }
      if (loopRange === undefined) {
        for (let range of loopRanges) {
          let distToStart = t - range.fromT;
          let distToEnd = t - range.toT;
          if (distToStart < 0 && distToStart > -transitionWidth) {
            loopBlend = 1 + distToStart / transitionWidth;
            loopRange = range;
            break;
          }
          if (distToEnd > 0 && distToEnd < transitionWidth) {
            loopBlend = 1 - distToEnd / transitionWidth;
            loopRange = range;
            break;
          }
        }
      }

      let up: THREE.Vector3;
      if (loopRange !== undefined) {
        const dir = loopRange.right.clone().normalize();
        const tParam = new THREE.Vector3().subVectors(position, loopRange.centrePoint).dot(dir);
        const centre = loopRange.centrePoint.clone().add(dir.multiplyScalar(tParam));
        let loopUp = new THREE.Vector3().subVectors(centre, position).normalize();
        let loopForward = forward.clone();
        loopForward.addScaledVector(loopForward, -loopForward.dot(loopRange.right)).normalize();

        if (loopBlend < 1) {
          const worldUp = new THREE.Vector3(0.0, 1.0, 0.0);
          up = loopUp.clone().lerp(worldUp, 1 - loopBlend).normalize();
          forward = loopForward.clone().lerp(forward, 1 - loopBlend).normalize();
        } else {
          up = loopUp;
          forward = loopForward;
        }
      } else {
        up = new THREE.Vector3(0.0, 1.0, 0.0);
      }

      let right = new THREE.Vector3().crossVectors(forward, up).normalize();

      up.crossVectors(right, forward);

      if (twist !== 0) {
        up.applyAxisAngle(forward, twist);
        right.applyAxisAngle(forward, twist);
      }

      this.sampleFrames.push({ position, forward, up, right });
    }
  }

  public getFrameAt(t: number): TrackFrame {
    let n = this.sampleFrames.length - 1;
    t = Math.max(0, Math.min(1, t));

    let idx = t * n;
    let lo = Math.floor(idx);
    let hi = Math.min(lo + 1, n);
    if (lo < 0) lo = 0;
    let frac = idx - lo;

    let frameLo = this.sampleFrames[lo];
    let frameHi = this.sampleFrames[hi];

    let pos = new THREE.Vector3().lerpVectors(frameLo.position, frameHi.position, frac);
    let up = new THREE.Vector3().lerpVectors(frameLo.up, frameHi.up, frac).normalize();
    let forward = new THREE.Vector3().lerpVectors(frameLo.forward, frameHi.forward, frac).normalize();
    let right = new THREE.Vector3().crossVectors(forward, up).normalize();
    up.crossVectors(right, forward);

    return { position: pos, forward, up, right };
  }
}
