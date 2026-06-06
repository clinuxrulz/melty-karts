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
  private segments: number;
  
  // Precomputed structural spine
  private positions: THREE.Vector3[] = [];
  private tangents: THREE.Vector3[] = [];
  private baseNormals: THREE.Vector3[] = [];
  private twists: number[] = [];

  constructor(curve: CatmullRomCurve4, segments: number = 200) {
    this.curve = curve;
    this.segments = segments;
    this.buildSpine();
  }

  private buildSpine() {
    // 1. Sample the curve
    for (let i = 0; i <= this.segments; i++) {
      const t = i / this.segments;
      const p4 = this.curve.getPoint(t);
      
      this.positions.push(new THREE.Vector3(p4.x, p4.y, p4.z));
      this.twists.push(p4.w);
    }

    // 2. Compute Tangents (Forward vectors) using finite difference
    for (let i = 0; i <= this.segments; i++) {
      const t = i / this.segments;
      // Step slightly forward to get the direction, handle the end of the track
      const tNext = Math.min(1.0, t + 0.001);
      const tPrev = Math.max(0.0, t - 0.001);
      
      const pNext = this.curve.getPoint(tNext);
      const pPrev = this.curve.getPoint(tPrev);
      
      const tangent = new THREE.Vector3(
        pNext.x - pPrev.x,
        pNext.y - pPrev.y,
        pNext.z - pPrev.z
      ).normalize();
      
      this.tangents.push(tangent);
    }

    // 3. Parallel Transport (Rotation Minimizing Frame) to establish base Up vectors
    let initialNormal = new THREE.Vector3(0, 1, 0);
    // Safety check: if track starts pointing straight up, pick a different reference
    if (Math.abs(this.tangents[0].dot(initialNormal)) > 0.99) {
      initialNormal.set(0, 0, 1);
    }
    
    // Ensure initial normal is perfectly orthogonal to the first tangent
    const initialRight = new THREE.Vector3().crossVectors(this.tangents[0], initialNormal).normalize();
    initialNormal.crossVectors(initialRight, this.tangents[0]).normalize();
    
    this.baseNormals.push(initialNormal);

    for (let i = 1; i <= this.segments; i++) {
      const prevTangent = this.tangents[i - 1];
      const currTangent = this.tangents[i];
      const currentNormal = this.baseNormals[i - 1].clone();

      // Find the axis and angle of rotation between tangents
      const axis = new THREE.Vector3().crossVectors(prevTangent, currTangent);
      const angle = prevTangent.angleTo(currTangent);

      // If the tangent changed, rotate the normal to match
      if (axis.lengthSq() > 1e-6) {
        axis.normalize();
        currentNormal.applyAxisAngle(axis, angle);
      }
      
      this.baseNormals.push(currentNormal);
    }
  }

  /**
   * Evaluates the track at any arbitrary t (0.0 to 1.0)
   * It interpolates the spine and applies the custom w twist.
   */
  public getFrameAt(t: number): TrackFrame {
    // Clamp t and find the segment indices
    t = Math.max(0, Math.min(1, t));
    const p = t * this.segments;
    const i1 = Math.floor(p);
    const i2 = Math.min(i1 + 1, this.segments);
    const weight = p - i1;

    // Interpolate Base Data
    const position = new THREE.Vector3().lerpVectors(this.positions[i1], this.positions[i2], weight);
    const forward = new THREE.Vector3().lerpVectors(this.tangents[i1], this.tangents[i2], weight).normalize();
    const baseUp = new THREE.Vector3().lerpVectors(this.baseNormals[i1], this.baseNormals[i2], weight).normalize();
    
    // Lerp the 4th dimension twist (w)
    const twist = THREE.MathUtils.lerp(this.twists[i1], this.twists[i2], weight);

    // Apply the twist!
    // Rotate the interpolated base Up vector around the Forward tangent vector
    const finalUp = baseUp.clone().applyAxisAngle(forward, twist);
    
    // Calculate final Right vector
    const right = new THREE.Vector3().crossVectors(forward, finalUp).normalize();

    return { position, forward, up: finalUp, right };
  }
}