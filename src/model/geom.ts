import type { Pt } from './types';

/** Affine transform [a, b, c, d, e, f]: x' = a*x + c*y + e, y' = b*x + d*y + f */
export type Mat = [number, number, number, number, number, number];

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function translate(x: number, y: number): Mat {
  return [1, 0, 0, 1, x, y];
}

export function scale(sx: number, sy: number): Mat {
  return [sx, 0, 0, sy, 0, 0];
}

export function rotate(rad: number): Mat {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, s, -s, c, 0, 0];
}

export function apply(m: Mat, x: number, y: number): Pt {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** True when the transform only moves, turns and scales evenly (circles stay circles). */
export function isSimilarity(m: Mat): boolean {
  const eps = 1e-9 * (Math.abs(m[0]) + Math.abs(m[1]) + 1);
  return Math.abs(m[0] - m[3]) < eps && Math.abs(m[1] + m[2]) < eps;
}

export function matScale(m: Mat): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

export function matRotation(m: Mat): number {
  return Math.atan2(m[1], m[0]);
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Area of a polygon (always positive), same units squared as the points. */
export function polygonArea(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

export function perimeter(pts: Pt[], closed: boolean): number {
  let s = 0;
  for (let i = 0; i + 1 < pts.length; i++) s += dist(pts[i], pts[i + 1]);
  if (closed && pts.length > 2) s += dist(pts[pts.length - 1], pts[0]);
  return s;
}

/** Angle at b between the lines b-a and b-c, in degrees (0 to 180). */
export function angleAt(a: Pt, b: Pt, c: Pt): number {
  const a1 = Math.atan2(a[1] - b[1], a[0] - b[0]);
  const a2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
  let d = Math.abs(a1 - a2) * (180 / Math.PI);
  if (d > 180) d = 360 - d;
  return d;
}

/** Points along an arc from angle a0 anticlockwise by `sweep` radians (negative = clockwise). */
export function arcPoints(cx: number, cy: number, r: number, a0: number, sweep: number, out: number[]): void {
  const n = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 48)));
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    out.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
}

/**
 * A DXF "bulge" describes an arc between two polyline points.
 * Appends the points after p1, up to and including p2.
 */
export function bulgePoints(p1: Pt, p2: Pt, bulge: number, out: number[]): void {
  const chord = dist(p1, p2);
  if (!bulge || chord === 0) {
    out.push(p2[0], p2[1]);
    return;
  }
  const theta = 4 * Math.atan(bulge);
  const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
  const mx = (p1[0] + p2[0]) / 2;
  const my = (p1[1] + p2[1]) / 2;
  const h = r * Math.cos(theta / 2) * Math.sign(bulge);
  const ux = -(p2[1] - p1[1]) / chord;
  const uy = (p2[0] - p1[0]) / chord;
  const cx = mx + ux * h;
  const cy = my + uy * h;
  const a0 = Math.atan2(p1[1] - cy, p1[0] - cx);
  const tmp: number[] = [];
  arcPoints(cx, cy, Math.abs(r), a0, theta, tmp);
  for (let i = 2; i < tmp.length - 2; i++) out.push(tmp[i]);
  out.push(p2[0], p2[1]);
}

/** Where two line segments cross, or null. */
export function segIntersect(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const rX = b[0] - a[0];
  const rY = b[1] - a[1];
  const sX = d[0] - c[0];
  const sY = d[1] - c[1];
  const den = rX * sY - rY * sX;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * sY - (c[1] - a[1]) * sX) / den;
  const u = ((c[0] - a[0]) * rY - (c[1] - a[1]) * rX) / den;
  const e = 1e-9;
  if (t < -e || t > 1 + e || u < -e || u > 1 + e) return null;
  return [a[0] + t * rX, a[1] + t * rY];
}

/** Closest point on segment a-b to p. */
export function closestOnSeg(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return a;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return [a[0] + t * dx, a[1] + t * dy];
}

/** Is angle `a` on the anticlockwise arc from a0 to a1? */
export function angleOnArc(a: number, a0: number, a1: number): boolean {
  const two = Math.PI * 2;
  const span = (((a1 - a0) % two) + two) % two || two;
  const rel = (((a - a0) % two) + two) % two;
  return rel <= span + 1e-9;
}
