// Reads a DXF file into our own drawing model.
import DxfParser from 'dxf-parser';
import {
  type BBox,
  type Drawing,
  type Layer,
  type Prim,
  type Pt,
  bboxValid,
  emptyBBox,
  growBBox,
} from '../model/types';
import {
  type Mat,
  apply,
  arcPoints,
  bulgePoints,
  isSimilarity,
  matRotation,
  matScale,
  mul,
  rotate,
  scale,
  translate,
} from '../model/geom';

/* eslint-disable @typescript-eslint/no-explicit-any */

const DEG = Math.PI / 180;

/** $INSUNITS code -> [millimetres per unit, plain name] */
const UNITS: Record<number, [number, string]> = {
  1: [25.4, 'inches'],
  2: [304.8, 'feet'],
  4: [1, 'millimetres'],
  5: [10, 'centimetres'],
  6: [1000, 'metres'],
};

export function parseDxf(text: string, name: string): Drawing {
  const parser = new DxfParser();
  let dxf: any;
  try {
    dxf = parser.parseSync(text);
  } catch {
    throw new Error('This file could not be read as a DXF drawing. It may be damaged or a different kind of file.');
  }
  if (!dxf) throw new Error('This file is empty or is not a DXF drawing.');
  return convertDxf(dxf, name);
}

function css(n: number): string {
  return '#' + (n & 0xffffff).toString(16).padStart(6, '0');
}

interface Ctx {
  layers: Layer[];
  layerIndex: Map<string, number>;
  blocks: Record<string, any>;
  prims: Prim[];
}

interface Inherit {
  layer: number;
  color: string | null;
}

export function convertDxf(dxf: any, name: string): Drawing {
  const layers: Layer[] = [];
  const layerIndex = new Map<string, number>();
  const table = dxf.tables?.layer?.layers ?? {};
  for (const key of Object.keys(table)) {
    const l = table[key];
    layerIndex.set(l.name, layers.length);
    layers.push({
      name: l.name,
      color: l.colorIndex === 7 || l.color == null ? null : css(l.color),
      visible: l.visible !== false && !l.frozen,
    });
  }
  const ctx: Ctx = { layers, layerIndex, blocks: dxf.blocks ?? {}, prims: [] };

  const code = Number(dxf.header?.$INSUNITS ?? 0);
  const unit = UNITS[code];
  const k = unit ? unit[0] : 1;
  const unitNote = unit
    ? `The file is drawn in ${unit[1]}.`
    : 'The file does not say what units it uses, so it is read as millimetres.';
  const root: Mat = scale(k, k);

  for (const e of dxf.entities ?? []) {
    addEntity(ctx, e, root, { layer: layerOf(ctx, '0'), color: null }, 0);
  }

  const bbox = emptyBBox();
  for (const p of ctx.prims) {
    if (!layers[p.layer].visible) continue;
    growBBox(bbox, p.bbox.minX, p.bbox.minY);
    growBBox(bbox, p.bbox.maxX, p.bbox.maxY);
  }
  if (!bboxValid(bbox)) {
    for (const p of ctx.prims) {
      growBBox(bbox, p.bbox.minX, p.bbox.minY);
      growBBox(bbox, p.bbox.maxX, p.bbox.maxY);
    }
  }
  if (!bboxValid(bbox)) Object.assign(bbox, { minX: 0, minY: 0, maxX: 1000, maxY: 1000 });
  return { name, layers, prims: ctx.prims, bbox, unitNote };
}

function layerOf(ctx: Ctx, name: string | undefined): number {
  const n = name ?? '0';
  let i = ctx.layerIndex.get(n);
  if (i === undefined) {
    i = ctx.layers.length;
    ctx.layerIndex.set(n, i);
    ctx.layers.push({ name: n, color: null, visible: true });
  }
  return i;
}

function resolve(ctx: Ctx, e: any, inh: Inherit, depth: number): Inherit {
  // Things drawn on layer "0" inside a block take on the layer of the block's placement.
  const layer = depth > 0 && (e.layer ?? '0') === '0' ? inh.layer : layerOf(ctx, e.layer);
  let color: string | null;
  if (e.colorIndex === 0) color = inh.color;
  else if (e.colorIndex === undefined || e.colorIndex === 256) {
    color = e.color != null && e.colorIndex === undefined ? css(e.color) : ctx.layers[layer].color;
  } else if (e.colorIndex === 7) color = null;
  else color = e.color != null ? css(e.color) : null;
  return { layer, color };
}

function pathBBox(pts: ArrayLike<number>): BBox {
  const b = emptyBBox();
  for (let i = 0; i < pts.length; i += 2) growBBox(b, pts[i], pts[i + 1]);
  return b;
}

function pushPath(ctx: Ctx, who: Inherit, m: Mat, local: number[], closed: boolean): void {
  if (local.length < 4) return;
  const pts = new Float64Array(local.length);
  for (let i = 0; i < local.length; i += 2) {
    const p = apply(m, local[i], local[i + 1]);
    pts[i] = p[0];
    pts[i + 1] = p[1];
  }
  ctx.prims.push({ k: 'path', layer: who.layer, color: who.color, pts, closed, bbox: pathBBox(pts) });
}

function pushCircle(ctx: Ctx, who: Inherit, m: Mat, c: any, r: number, a0?: number, a1?: number): void {
  if (!(r > 0) || !c) return;
  const full = a0 === undefined || a1 === undefined;
  if (!isSimilarity(m)) {
    // Stretched or mirrored: draw as many short lines instead.
    const out: number[] = [];
    let sweep = Math.PI * 2;
    if (!full) {
      sweep = (a1! - a0!) % (Math.PI * 2);
      if (sweep <= 0) sweep += Math.PI * 2;
    }
    arcPoints(c.x, c.y, r, full ? 0 : a0!, sweep, out);
    pushPath(ctx, who, m, out, false);
    return;
  }
  const [cx, cy] = apply(m, c.x, c.y);
  const R = r * matScale(m);
  const bbox = { minX: cx - R, minY: cy - R, maxX: cx + R, maxY: cy + R };
  if (full) {
    ctx.prims.push({ k: 'circle', layer: who.layer, color: who.color, cx, cy, r: R, bbox });
  } else {
    const rot = matRotation(m);
    ctx.prims.push({ k: 'arc', layer: who.layer, color: who.color, cx, cy, r: R, a0: a0! + rot, a1: a1! + rot, bbox });
  }
}

function cleanText(s: string): string[] {
  return String(s ?? '')
    .replace(/\\P/g, '\n')
    .replace(/\\[ACFHQTWfp][^;]*;/g, '')
    .replace(/\\S([^;^/#]*)[/^#]([^;]*);/g, '$1/$2')
    .replace(/\\[LlOoKk]/g, '')
    .replace(/\\~/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/%%[cC]/g, 'Ø')
    .replace(/%%[dD]/g, '°')
    .replace(/%%[pP]/g, '±')
    .replace(/%%[uUoO]/g, '')
    .split('\n');
}

function pushText(
  ctx: Ctx,
  who: Inherit,
  m: Mat,
  pos: any,
  height: number,
  rotRad: number,
  text: string,
  ha: 0 | 1 | 2,
  va: 'base' | 'bottom' | 'mid' | 'top',
): void {
  if (!pos || !text) return;
  const lines = cleanText(text);
  const [x, y] = apply(m, pos.x, pos.y);
  const h = (height || 2.5) * matScale(m);
  const rot = rotRad + matRotation(m);
  // Rough outline of the words, used to work out the size of the drawing.
  const w = Math.max(...lines.map((l) => l.length)) * h * 0.62;
  const tall = h * (1 + (lines.length - 1) * 1.35);
  const x0 = ha === 1 ? -w / 2 : ha === 2 ? -w : 0;
  const y1 = va === 'top' ? 0 : va === 'mid' ? tall / 2 : va === 'bottom' ? tall : h;
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const bbox = emptyBBox();
  for (const [lx, ly] of [[x0, y1], [x0 + w, y1], [x0 + w, y1 - tall], [x0, y1 - tall]]) {
    growBBox(bbox, x + lx * cs - ly * sn, y + lx * sn + ly * cs);
  }
  ctx.prims.push({
    k: 'text',
    layer: who.layer,
    color: who.color,
    x,
    y,
    h,
    rot,
    lines,
    ha,
    va,
    bbox,
  });
}

function addEntity(ctx: Ctx, e: any, m: Mat, inh: Inherit, depth: number): void {
  if (!e || e.visible === false || e.inPaperSpace) return;
  const who = resolve(ctx, e, inh, depth);
  switch (e.type) {
    case 'LINE': {
      const v = e.vertices;
      if (v?.length >= 2) pushPath(ctx, who, m, [v[0].x, v[0].y, v[1].x, v[1].y], false);
      break;
    }
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const v: any[] = e.vertices ?? [];
      if (v.length < 2) break;
      const closed = !!e.shape;
      const out: number[] = [v[0].x, v[0].y];
      const n = closed ? v.length : v.length - 1;
      for (let i = 0; i < n; i++) {
        const a = v[i];
        const b = v[(i + 1) % v.length];
        bulgePoints([a.x, a.y], [b.x, b.y], a.bulge ?? 0, out);
      }
      if (closed) out.length -= 2; // last point repeats the first
      pushPath(ctx, who, m, out, closed);
      break;
    }
    case 'CIRCLE':
      pushCircle(ctx, who, m, e.center, e.radius);
      break;
    case 'ARC':
      pushCircle(ctx, who, m, e.center, e.radius, e.startAngle, e.endAngle);
      break;
    case 'ELLIPSE': {
      const c = e.center;
      const maj = e.majorAxisEndPoint;
      if (!c || !maj) break;
      const a = Math.hypot(maj.x, maj.y);
      const b = a * (e.axisRatio ?? 1);
      const rot = Math.atan2(maj.y, maj.x);
      const t0 = e.startAngle ?? 0;
      let t1 = e.endAngle ?? Math.PI * 2;
      if (t1 <= t0) t1 += Math.PI * 2;
      const full = Math.abs(t1 - t0 - Math.PI * 2) < 1e-6;
      const out: number[] = [];
      const n = 96;
      const cs = Math.cos(rot);
      const sn = Math.sin(rot);
      for (let i = 0; i <= n - (full ? 1 : 0); i++) {
        const t = t0 + ((t1 - t0) * i) / n;
        const x = a * Math.cos(t);
        const y = b * Math.sin(t);
        out.push(c.x + x * cs - y * sn, c.y + x * sn + y * cs);
      }
      pushPath(ctx, who, m, out, full);
      break;
    }
    case 'SPLINE': {
      const out = splinePoints(e);
      pushPath(ctx, who, m, out, !!e.closed && out.length > 4);
      break;
    }
    case 'SOLID':
    case '3DFACE': {
      const p: any[] = e.points ?? e.vertices ?? [];
      if (p.length < 3) break;
      const order = e.type === 'SOLID' && p.length === 4 ? [0, 1, 3, 2] : p.map((_, i) => i);
      const out: number[] = [];
      for (const i of order) out.push(p[i].x, p[i].y);
      pushPath(ctx, who, m, out, true);
      break;
    }
    case 'TEXT': {
      const aligned = (e.halign ?? 0) !== 0 || (e.valign ?? 0) !== 0;
      const pos = aligned && e.endPoint ? e.endPoint : e.startPoint;
      const ha: 0 | 1 | 2 = e.halign === 1 || e.halign === 4 ? 1 : e.halign === 2 ? 2 : 0;
      const va = e.halign === 4 ? 'mid' : e.valign === 3 ? 'top' : e.valign === 2 ? 'mid' : e.valign === 1 ? 'bottom' : 'base';
      pushText(ctx, who, m, pos, e.textHeight, (e.rotation ?? 0) * DEG, e.text, ha, va);
      break;
    }
    case 'MTEXT': {
      const ap = e.attachmentPoint ?? 1;
      const ha = ((ap - 1) % 3) as 0 | 1 | 2;
      const va = (['top', 'mid', 'bottom'] as const)[Math.floor((ap - 1) / 3)] ?? 'top';
      let rot = (e.rotation ?? 0) * DEG;
      if (e.directionVector) rot = Math.atan2(e.directionVector.y, e.directionVector.x);
      pushText(ctx, who, m, e.position, e.height, rot, e.text, ha, va);
      break;
    }
    case 'INSERT': {
      const block = ctx.blocks[e.name];
      if (!block || depth > 12) break;
      const base = block.position ?? { x: 0, y: 0 };
      const cols = Math.max(1, e.columnCount ?? 1);
      const rows = Math.max(1, e.rowCount ?? 1);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const local = mul(
            mul(translate(e.position?.x ?? 0, e.position?.y ?? 0), rotate((e.rotation ?? 0) * DEG)),
            mul(
              translate(c * (e.columnSpacing ?? 0), r * (e.rowSpacing ?? 0)),
              mul(scale(e.xScale ?? 1, e.yScale ?? 1), translate(-base.x, -base.y)),
            ),
          );
          const mm = mul(m, local);
          for (const child of block.entities ?? []) addEntity(ctx, child, mm, who, depth + 1);
        }
      }
      break;
    }
    case 'DIMENSION': {
      // A dimension's arrows, lines and text are stored as a ready-drawn block.
      const block = e.block ? ctx.blocks[e.block] : null;
      if (!block || depth > 12) break;
      for (const child of block.entities ?? []) addEntity(ctx, child, m, who, depth + 1);
      break;
    }
    default:
      break;
  }
}

function splinePoints(e: any): number[] {
  const cps: any[] = e.controlPoints ?? [];
  const knots: number[] = e.knotValues ?? [];
  const deg: number = e.degreeOfSplineCurve ?? 3;
  const out: number[] = [];
  if (cps.length > deg && knots.length >= cps.length + deg + 1) {
    const lo = knots[deg];
    const hi = knots[cps.length];
    const steps = Math.max(24, cps.length * 12);
    for (let s = 0; s <= steps; s++) {
      const t = Math.min(lo + ((hi - lo) * s) / steps, hi - 1e-9 * (hi - lo));
      const p = deBoor(t, deg, cps, knots);
      out.push(p[0], p[1]);
    }
    return out;
  }
  for (const p of (e.fitPoints?.length ? e.fitPoints : cps) as any[]) out.push(p.x, p.y);
  return out;
}

function deBoor(t: number, deg: number, cps: any[], knots: number[]): Pt {
  let k = deg;
  while (k < cps.length - 1 && t >= knots[k + 1]) k++;
  const d: Pt[] = [];
  for (let j = 0; j <= deg; j++) d.push([cps[j + k - deg].x, cps[j + k - deg].y]);
  for (let r = 1; r <= deg; r++) {
    for (let j = deg; j >= r; j--) {
      const i = j + k - deg;
      const den = knots[i + deg - r + 1] - knots[i];
      const a = den === 0 ? 0 : (t - knots[i]) / den;
      d[j] = [(1 - a) * d[j - 1][0] + a * d[j][0], (1 - a) * d[j - 1][1] + a * d[j][1]];
    }
  }
  return d[deg];
}
