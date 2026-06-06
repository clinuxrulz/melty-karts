import * as THREE from 'three';

// Helper class to compute coefficients for a cubic polynomial
class CubicPoly {
  c0: number = 0;
  c1: number = 0;
  c2: number = 0;
  c3: number = 0;

  init(x0: number, x1: number, t0: number, t1: number) {
    this.c0 = x0;
    this.c1 = t0;
    this.c2 = -3 * x0 + 3 * x1 - 2 * t0 - t1;
    this.c3 = 2 * x0 - 2 * x1 + t0 + t1;
  }

  initNonuniformCatmullRom(x0: number, x1: number, x2: number, x3: number, dt0: number, dt1: number, dt2: number) {
    // Compute tangents parameterized in [t1, t2]
    let t1 = (x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1;
    let t2 = (x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2;

    // Rescale tangents for parametrization in [0, 1]
    t1 *= dt1;
    t2 *= dt1;

    this.init(x1, x2, t1, t2);
  }

  calc(t: number): number {
    const t2 = t * t;
    const t3 = t2 * t;
    return this.c0 + this.c1 * t + this.c2 * t2 + this.c3 * t3;
  }
}

export class CatmullRomCurve4 {
  points: THREE.Vector4[];
  closed: boolean;

  constructor(points: THREE.Vector4[] = [], closed: boolean = false) {
    this.points = points;
    this.closed = closed;
  }

  getPoint(t: number, optionalTarget = new THREE.Vector4()): THREE.Vector4 {
    const points = this.points;
    const l = points.length;

    // Map t to the sequence of points
    const p = (l - (this.closed ? 0 : 1)) * t;
    let intPoint = Math.floor(p);
    let weight = p - intPoint;

    if (this.closed) {
      intPoint += intPoint > 0 ? 0 : (Math.floor(Math.abs(intPoint) / l) + 1) * l;
    } else if (weight === 0 && intPoint === l - 1) {
      intPoint = l - 2;
      weight = 1;
    }

    let p0: THREE.Vector4, p1: THREE.Vector4, p2: THREE.Vector4, p3: THREE.Vector4;

    // Fetch the 4 control points for this segment
    if (this.closed || intPoint > 0) {
      p0 = points[(intPoint - 1) % l];
    } else {
      // Extrapolate first point if not closed
      p0 = new THREE.Vector4().subVectors(points[0], points[1]).add(points[0]);
    }

    p1 = points[intPoint % l];
    p2 = points[(intPoint + 1) % l];

    if (this.closed || intPoint + 2 < l) {
      p3 = points[(intPoint + 2) % l];
    } else {
      // Extrapolate last point if not closed
      p3 = new THREE.Vector4().subVectors(points[l - 1], points[l - 2]).add(points[l - 1]);
    }

    // Calculate 4D Distance Squared
    const distSq = (a: THREE.Vector4, b: THREE.Vector4) => {
      const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z, dw = a.w - b.w;
      return dx * dx + dy * dy + dz * dz + dw * dw;
    };

    // Centripetal parameterization
    let dt0 = Math.pow(distSq(p0, p1), 0.25);
    let dt1 = Math.pow(distSq(p1, p2), 0.25);
    let dt2 = Math.pow(distSq(p2, p3), 0.25);

    // Safety check to prevent divide-by-zero on repeated points
    if (dt1 < 1e-4) dt1 = 1.0;
    if (dt0 < 1e-4) dt0 = dt1;
    if (dt2 < 1e-4) dt2 = dt1;

    // Initialize polynomials for each axis
    const px = new CubicPoly();
    const py = new CubicPoly();
    const pz = new CubicPoly();
    const pw = new CubicPoly();

    px.initNonuniformCatmullRom(p0.x, p1.x, p2.x, p3.x, dt0, dt1, dt2);
    py.initNonuniformCatmullRom(p0.y, p1.y, p2.y, p3.y, dt0, dt1, dt2);
    pz.initNonuniformCatmullRom(p0.z, p1.z, p2.z, p3.z, dt0, dt1, dt2);
    pw.initNonuniformCatmullRom(p0.w, p1.w, p2.w, p3.w, dt0, dt1, dt2);

    // Evaluate the point
    return optionalTarget.set(
      px.calc(weight),
      py.calc(weight),
      pz.calc(weight),
      pw.calc(weight)
    );
  }
}
