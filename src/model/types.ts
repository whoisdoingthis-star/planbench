// The one internal drawing model. Everything is in millimetres, Y pointing up.
// Every file type we open is converted into this, so tools work on any file.

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Layer {
  name: string;
  /** CSS colour, or null for "foreground" (black on paper, white on dark). */
  color: string | null;
  visible: boolean;
}

interface PrimBase {
  layer: number;
  color: string | null;
  bbox: BBox;
}

export interface PathPrim extends PrimBase {
  k: 'path';
  /** x0,y0,x1,y1,... */
  pts: Float64Array;
  closed: boolean;
}

export interface CirclePrim extends PrimBase {
  k: 'circle';
  cx: number;
  cy: number;
  r: number;
}

export interface ArcPrim extends PrimBase {
  k: 'arc';
  cx: number;
  cy: number;
  r: number;
  /** Radians, drawn anticlockwise from a0 to a1. */
  a0: number;
  a1: number;
}

export interface TextPrim extends PrimBase {
  k: 'text';
  x: number;
  y: number;
  h: number;
  rot: number;
  lines: string[];
  ha: 0 | 1 | 2;
  va: 'base' | 'bottom' | 'mid' | 'top';
}

export type Prim = PathPrim | CirclePrim | ArcPrim | TextPrim;

/** A picture (a scanned plan, a photo, or a PDF page) shown underneath everything else. */
export interface Underlay {
  image: CanvasImageSource;
  /** Bottom-left corner and size, in millimetres. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** For PDFs: the width of the printed page in millimetres, so "1:100" style scales can be applied. */
  paperW?: number;
}

export interface Drawing {
  name: string;
  layers: Layer[];
  prims: Prim[];
  bbox: BBox;
  /** Plain-words note about the units the file said it used. */
  unitNote: string;
  underlay?: Underlay;
  /** False until we know real sizes (pictures and PDFs need their scale setting first). */
  scaled: boolean;
}

export type Pt = [number, number];

export function emptyBBox(): BBox {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function growBBox(b: BBox, x: number, y: number): void {
  if (x < b.minX) b.minX = x;
  if (y < b.minY) b.minY = y;
  if (x > b.maxX) b.maxX = x;
  if (y > b.maxY) b.maxY = y;
}

export function bboxValid(b: BBox): boolean {
  return Number.isFinite(b.minX) && Number.isFinite(b.maxX) && Number.isFinite(b.minY) && Number.isFinite(b.maxY);
}

/** Makes everything in the drawing `k` times bigger, measured from the origin. Used when setting the scale. */
export function scaleDrawing(d: Drawing, k: number): void {
  const box = (b: BBox) => {
    b.minX *= k; b.minY *= k; b.maxX *= k; b.maxY *= k;
  };
  for (const p of d.prims) {
    box(p.bbox);
    if (p.k === 'path') {
      for (let i = 0; i < p.pts.length; i++) p.pts[i] *= k;
    } else if (p.k === 'text') {
      p.x *= k; p.y *= k; p.h *= k;
    } else {
      p.cx *= k; p.cy *= k; p.r *= k;
    }
  }
  box(d.bbox);
  if (d.underlay) {
    d.underlay.x *= k; d.underlay.y *= k; d.underlay.w *= k; d.underlay.h *= k;
  }
  d.scaled = true;
}
