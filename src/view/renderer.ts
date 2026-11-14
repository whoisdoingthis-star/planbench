import type { Drawing, Prim } from '../model/types';
import type { Viewport } from './viewport';

export interface Theme {
  background: string;
  foreground: string;
  dark: boolean;
}

export const PAPER: Theme = { background: '#ffffff', foreground: '#1b1f24', dark: false };
export const DARK: Theme = { background: '#1e2228', foreground: '#f2f4f7', dark: true };

const cache = new Map<string, string>();

/** Makes a file's colour readable on the current background (yellow on white paper is invisible). */
export function readable(color: string | null, theme: Theme): string {
  if (!color) return theme.foreground;
  const key = (theme.dark ? 'd' : 'l') + color;
  let out = cache.get(key);
  if (out) return out;
  const n = parseInt(color.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (!theme.dark && lum > 0.6) {
    const k = 0.6 / lum * 0.8;
    r = Math.round(r * k); g = Math.round(g * k); b = Math.round(b * k);
  } else if (theme.dark && lum < 0.3) {
    const lift = 110;
    r = Math.min(255, r + lift); g = Math.min(255, g + lift); b = Math.min(255, b + lift);
  }
  out = `rgb(${r},${g},${b})`;
  cache.set(key, out);
  return out;
}

const buckets = new WeakMap<Drawing, Map<string, Prim[]>>();

function bucketsFor(d: Drawing): Map<string, Prim[]> {
  let m = buckets.get(d);
  if (!m) {
    m = new Map();
    for (const p of d.prims) {
      const key = p.color ?? '';
      let list = m.get(key);
      if (!list) m.set(key, (list = []));
      list.push(p);
    }
    buckets.set(d, m);
  }
  return m;
}

export function drawDrawing(ctx: CanvasRenderingContext2D, d: Drawing, v: Viewport, theme: Theme): void {
  const vis = v.visible();
  const z = v.zoom;
  const ox = v.w / 2 - v.cx * z;
  const oy = v.h / 2 + v.cy * z;
  if (d.underlay) {
    const u = d.underlay;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(u.image, u.x * z + ox, oy - (u.y + u.h) * z, u.w * z, u.h * z);
    // A faint edge, so a white page can be seen on a white background.
    ctx.strokeStyle = theme.dark ? '#4a525d' : '#c3cad2';
    ctx.lineWidth = 1;
    ctx.strokeRect(u.x * z + ox, oy - (u.y + u.h) * z, u.w * z, u.h * z);
  }
  ctx.lineWidth = 1;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const [key, prims] of bucketsFor(d)) {
    const colour = readable(key || null, theme);
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.beginPath();
    const texts: Prim[] = [];
    for (const p of prims) {
      if (!d.layers[p.layer].visible) continue;
      const b = p.bbox;
      if (b.maxX < vis.minX || b.minX > vis.maxX || b.maxY < vis.minY || b.minY > vis.maxY) continue;
      if (p.k === 'path') {
        const pts = p.pts;
        // Too small to see: draw a dot-sized stroke rather than every point.
        if ((b.maxX - b.minX) * z < 0.75 && (b.maxY - b.minY) * z < 0.75) {
          const x = pts[0] * z + ox;
          const y = oy - pts[1] * z;
          ctx.moveTo(x, y);
          ctx.lineTo(x + 0.5, y);
          continue;
        }
        ctx.moveTo(pts[0] * z + ox, oy - pts[1] * z);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * z + ox, oy - pts[i + 1] * z);
        if (p.closed) ctx.closePath();
      } else if (p.k === 'circle') {
        const x = p.cx * z + ox;
        const y = oy - p.cy * z;
        ctx.moveTo(x + p.r * z, y);
        ctx.arc(x, y, p.r * z, 0, Math.PI * 2);
      } else if (p.k === 'arc') {
        const x = p.cx * z + ox;
        const y = oy - p.cy * z;
        ctx.moveTo(x + p.r * z * Math.cos(p.a0), y - p.r * z * Math.sin(p.a0));
        // Screen Y points down, so an anticlockwise arc in the drawing is drawn with negated angles.
        ctx.arc(x, y, p.r * z, -p.a0, -p.a1, true);
      } else {
        texts.push(p);
      }
    }
    ctx.stroke();

    for (const p of texts) {
      if (p.k !== 'text') continue;
      const px = p.h * z;
      if (px < 3) continue;
      ctx.save();
      ctx.translate(p.x * z + ox, oy - p.y * z);
      ctx.rotate(-p.rot);
      ctx.font = `${px}px "Helvetica Neue", Arial, sans-serif`;
      ctx.textAlign = p.ha === 1 ? 'center' : p.ha === 2 ? 'right' : 'left';
      const lh = px * 1.35;
      let y0 = 0;
      if (p.va === 'base') ctx.textBaseline = 'alphabetic';
      else if (p.va === 'bottom') { ctx.textBaseline = 'bottom'; y0 = -(p.lines.length - 1) * lh; }
      else if (p.va === 'mid') { ctx.textBaseline = 'middle'; y0 = -((p.lines.length - 1) * lh) / 2; }
      else ctx.textBaseline = 'top';
      for (let i = 0; i < p.lines.length; i++) ctx.fillText(p.lines[i], 0, y0 + i * lh);
      ctx.restore();
    }
  }
}
