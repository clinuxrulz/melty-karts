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
  private sampleFrames: TrackFrame[];

  constructor(curve: CatmullRomCurve4, numSamples: number = 200) {
    this.curve = curve;
    this.sampleFrames = [];
    this.computeFrames(Math.max(2, numSamples));
  }

  private computeFrames(numSamples: number): void {
    let n = numSamples;
    let closed = this.curve.closed;

    let tangents: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      tangents.push(this.evalTangent(i / n));
    }

    // Initial frame at t=0 — use a robust reference up to
    // avoid the singularity when forward is near-vertical
    {
      let fwd = tangents[0];
      let pos = new THREE.Vector3().copy(this.curve.getPoint(0));
      let worldUp = new THREE.Vector3(0, 1, 0);
      let refUp: THREE.Vector3;
      if (Math.abs(fwd.dot(worldUp)) > 0.99) {
        refUp = new THREE.Vector3(0, 0, 1);
      } else {
        refUp = worldUp;
      }
      let right = new THREE.Vector3().crossVectors(fwd, refUp).normalize();
      let up = new THREE.Vector3().crossVectors(right, fwd);
      this.sampleFrames.push({ position: pos, forward: fwd.clone(), up, right });
    }

    // Propagate frames along the curve via parallel transport
    for (let i = 1; i <= n; i++) {
      let fwd = tangents[i];
      let pos = new THREE.Vector3().copy(this.curve.getPoint(i / n));
      let prev = this.sampleFrames[i - 1];

      let q = new THREE.Quaternion().setFromUnitVectors(prev.forward, fwd);

      let up = prev.up.clone().applyQuaternion(q);
      let right = prev.right.clone().applyQuaternion(q);

      right.crossVectors(fwd, up).normalize();
      up.crossVectors(right, fwd);

      this.sampleFrames.push({ position: pos, forward: fwd.clone(), up, right });
    }

    // Closed-loop holonomy correction — distribute the accumulated
    // rotation so the frame at t=1 matches the frame at t=0
    if (closed) {
      let first = this.sampleFrames[0];
      let last = this.sampleFrames[n];
      let holonomyAngle = this.signedAngle(last.up, first.up, last.forward);
      let step = -holonomyAngle / n;
      for (let i = 1; i <= n; i++) {
        let frame = this.sampleFrames[i];
        frame.up.applyAxisAngle(frame.forward, step * i);
        frame.right.crossVectors(frame.forward, frame.up).normalize();
      }
    }

    // Apply twist (stored as the 4th component of each curve point)
    for (let i = 0; i <= n; i++) {
      let pt = this.curve.getPoint(i / n);
      let twist = pt.w;
      let frame = this.sampleFrames[i];
      if (twist !== 0) {
        frame.up.applyAxisAngle(frame.forward, twist);
        frame.right.crossVectors(frame.forward, frame.up).normalize();
      }
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

  private evalTangent(t: number): THREE.Vector3 {
    let eps = 0.001;
    let t1 = t;
    let t2 = t + eps;
    if (t2 > 1.0) {
      if (this.curve.closed) {
        t2 -= 1.0;
      } else {
        t2 = t;
        t1 = t - eps;
      }
    }
    if (t1 < 0) t1 = 0;
    let pt1 = this.curve.getPoint(t1);
    let pt2 = this.curve.getPoint(t2);
    return new THREE.Vector3().subVectors(pt2, pt1).normalize();
  }

  private signedAngle(a: THREE.Vector3, b: THREE.Vector3, axis: THREE.Vector3): number {
    let cross = new THREE.Vector3().crossVectors(a, b);
    let dot = a.dot(b);
    return Math.atan2(cross.dot(axis), dot);
  }
}
