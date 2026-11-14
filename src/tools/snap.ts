// Snapping: when you point near a corner, middle, centre or crossing, we lock onto it exactly.
import type { Drawing, Pt } from '../model/types';
import { angleOnArc, closestOnSeg, segIntersect } from '../model/geom';

export type SnapKind = 'end' | 'mid' | 'cen' | 'int' | 'near';

export interface Snap {
  x: number;
  y: number;
  kind: SnapKind;
}

export const SNAP_NAMES: Record<SnapKind, string> = {
  end: 'Corner',
  mid: 'Middle',
  cen: 'Centre',
  int: 'Crossing',
  near: 'On line',
};

export function findSnap(d: Drawing, wx: number, wy: number, tol: number, on: ReadonlySet<SnapKind>): Snap | null {
  const p: Pt = [wx, wy];
  let best: Snap | null = null;
  let bestD = tol;
  let near: Snap | null = null;
  let nearD = tol;
  const segs: [Pt, Pt][] = [];

  const offer = (x: number, y: number, kind: SnapKind) => {
    if (!on.has(kind)) return;
    const dd = Math.hypot(x - wx, y - wy);
    if (kind === 'near') {
      if (dd < nearD) { nearD = dd; near = { x, y, kind }; }
    } else if (dd < bestD) {
      bestD = dd;
      best = { x, y, kind };
    }
  };

  for (const prim of d.prims) {
    if (!d.layers[prim.layer].visible) continue;
    const b = prim.bbox;
    if (wx < b.minX - tol || wx > b.maxX + tol || wy < b.minY - tol || wy > b.maxY + tol) continue;
    if (prim.k === 'path') {
      const pts = prim.pts;
      const n = pts.length / 2;
      const last = prim.closed ? n : n - 1;
      for (let i = 0; i < last; i++) {
        const j = (i + 1) % n;
        const a: Pt = [pts[i * 2], pts[i * 2 + 1]];
        const c: Pt = [pts[j * 2], pts[j * 2 + 1]];
        if (
          Math.min(a[0], c[0]) > wx + tol || Math.max(a[0], c[0]) < wx - tol ||
          Math.min(a[1], c[1]) > wy + tol || Math.max(a[1], c[1]) < wy - tol
        ) continue;
        offer(a[0], a[1], 'end');
        offer(c[0], c[1], 'end');
        offer((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 'mid');
        const q = closestOnSeg(p, a, c);
        if (Math.hypot(q[0] - wx, q[1] - wy) < tol) {
          offer(q[0], q[1], 'near');
          if (segs.length < 60) segs.push([a, c]);
        }
      }
    } else if (prim.k === 'circle' || prim.k === 'arc') {
      const dc = Math.hypot(wx - prim.cx, wy - prim.cy);
      const ang = Math.atan2(wy - prim.cy, wx - prim.cx);
      const onCurve = Math.abs(dc - prim.r) < tol && (prim.k === 'circle' || angleOnArc(ang, prim.a0, prim.a1));
      if (onCurve || dc < tol) offer(prim.cx, prim.cy, 'cen');
      if (onCurve) {
        offer(prim.cx + prim.r * Math.cos(ang), prim.cy + prim.r * Math.sin(ang), 'near');
      }
      if (prim.k === 'arc') {
        offer(prim.cx + prim.r * Math.cos(prim.a0), prim.cy + prim.r * Math.sin(prim.a0), 'end');
        offer(prim.cx + prim.r * Math.cos(prim.a1), prim.cy + prim.r * Math.sin(prim.a1), 'end');
      }
    } else if (prim.k === 'text') {
      offer(prim.x, prim.y, 'end');
    }
  }

  if (on.has('int')) {
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const x = segIntersect(segs[i][0], segs[i][1], segs[j][0], segs[j][1]);
        if (x) offer(x[0], x[1], 'int');
      }
    }
  }
  return best ?? near;
}
