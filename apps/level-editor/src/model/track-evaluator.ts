import * as THREE from 'three';
import { CatmullRomCurve4 } from './catmull-rom-curve4';

export interface TrackFrame {
  position: THREE.Vector3;
  forward: THREE.Vector3; // The tangent
  up: THREE.Vector3;      // The twisted up vector
  right: THREE.Vector3;   // Useful for extruding track width
}

export class TrackEvaluator {
  private curve: CatmullRomCurve4;
  
  constructor(curve: CatmullRomCurve4) {
    this.curve = curve;
  }

  public getFrameAt(t: number): TrackFrame {
    let t1 = t;
    let t2 = t + 0.01;
    if (t2 > 1.0) {
      t2 -= 1.0;
    }
    let pt1 = this.curve.getPoint(t1);
    let pt2 = this.curve.getPoint(t2);
    let position = new THREE.Vector3();
    let twist: number;
    position.copy(pt1);
    twist = pt1.w;
    let forward =
      new THREE.Vector3()
        .subVectors(pt2, pt1)
        .normalize();
    let up = new THREE.Vector3(0.0, 1.0, 0.0);
    let right =
      new THREE.Vector3()
        .crossVectors(
          forward,
          up,
        )
        .normalize();
    up.copy(right).cross(forward);
    up.applyAxisAngle(forward, twist);
    right.crossVectors(forward, up);
    return { position, forward, up, right, };
  }
}

