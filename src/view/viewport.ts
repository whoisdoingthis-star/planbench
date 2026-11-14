import type { BBox, Pt } from '../model/types';

/** Maps between the drawing (millimetres, Y up) and the screen (pixels, Y down). */
export class Viewport {
  cx = 0;
  cy = 0;
  /** Screen pixels per millimetre. */
  zoom = 0.1;
  w = 100;
  h = 100;

  toScreen(x: number, y: number): Pt {
    return [(x - this.cx) * this.zoom + this.w / 2, this.h / 2 - (y - this.cy) * this.zoom];
  }

  toWorld(sx: number, sy: number): Pt {
    return [(sx - this.w / 2) / this.zoom + this.cx, (this.h / 2 - sy) / this.zoom + this.cy];
  }

  panBy(dxPx: number, dyPx: number): void {
    this.cx -= dxPx / this.zoom;
    this.cy += dyPx / this.zoom;
  }

  /** Zoom by `factor`, keeping the drawing point under (sx, sy) where it is. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.toWorld(sx, sy);
    this.zoom = Math.min(1e4, Math.max(1e-6, this.zoom * factor));
    const after = this.toWorld(sx, sy);
    this.cx += before[0] - after[0];
    this.cy += before[1] - after[1];
  }

  fit(b: BBox, margin = 0.9): void {
    const bw = Math.max(b.maxX - b.minX, 1e-6);
    const bh = Math.max(b.maxY - b.minY, 1e-6);
    this.cx = (b.minX + b.maxX) / 2;
    this.cy = (b.minY + b.maxY) / 2;
    this.zoom = Math.min(this.w / bw, this.h / bh) * margin;
  }

  visible(): BBox {
    const a = this.toWorld(0, this.h);
    const b = this.toWorld(this.w, 0);
    return { minX: a[0], minY: a[1], maxX: b[0], maxY: b[1] };
  }

  clone(): Viewport {
    const v = new Viewport();
    Object.assign(v, this);
    return v;
  }
}
