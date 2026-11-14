// Builds a 3D model of the kitchen from the wall lists. Loaded only when the 3D view is opened.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { type Furniture, type HeightOption, type Layout, type Segment, type Wall, benchTop, optionFacts, wallWidth } from './layout';

export interface Finish {
  door: string;
  handle: string;
  bench: string;
}

export interface CameraState {
  pos: [number, number, number];
  target: [number, number, number];
}

export interface Mounted {
  dispose(): void;
  /** The current picture, as a PNG address that can be saved. */
  picture(): string;
  /** Jump to a standard viewpoint. */
  view(which: string): void;
  camera(): CameraState;
}

const MM = 0.001;
const BASE_D = 585;
const UPPER_D = 360;

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** One tile as a picture: the photo (repeated if it shows only part of the tile) with a grout line round it. */
function tileTexture(img: HTMLImageElement | null, tileW: number, tileH: number, repeatMm: number, plain: string, grout: string, wash?: { color: string; pct: number }): THREE.CanvasTexture {
  const scale = 512 / Math.max(tileW, tileH);
  const c = document.createElement('canvas');
  c.width = Math.max(8, Math.round(tileW * scale));
  c.height = Math.max(8, Math.round(tileH * scale));
  const g = c.getContext('2d')!;
  g.fillStyle = plain;
  g.fillRect(0, 0, c.width, c.height);
  if (img) {
    if (repeatMm > 0) {
      const cell = repeatMm * scale;
      for (let x = 0; x < c.width; x += cell) for (let y = 0; y < c.height; y += cell) g.drawImage(img, x, y, cell, cell);
    } else {
      g.drawImage(img, 0, 0, c.width, c.height);
    }
  }
  if (wash && wash.pct > 0) {
    // Lighten or warm the photo towards a chosen colour; photos rarely match the real tile exactly.
    g.globalAlpha = Math.min(1, wash.pct / 100);
    g.fillStyle = wash.color;
    g.fillRect(0, 0, c.width, c.height);
    g.globalAlpha = 1;
  }
  g.strokeStyle = grout;
  g.lineWidth = Math.max(2, 3 * scale);
  g.strokeRect(0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export async function mountKitchen(
  el: HTMLElement,
  l: Layout,
  o: HeightOption,
  finish: Finish,
  photos: { splash: string | null; floor: string | null; bench?: string | null },
  keep?: CameraState,
  realistic = false,
): Promise<Mounted> {
  const f = optionFacts(l, o);
  const bench = benchTop(l);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dfe6ec');
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => { disposables.push(x); return x; };

  const mat = (color: string, rough = 0.7, metal = 0) => track(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  const M = {
    door: mat(finish.door, 0.55),
    toe: mat('#3b4046', 0.8),
    bench: mat(finish.bench, 0.35),
    handle: mat(finish.handle, 0.3, 0.8),
    steel: mat('#aeb4ba', 0.3, 0.7),
    black: mat('#15171a', 0.2, 0.1),
    wall: mat('#f1eee8', 0.95),
    frame: mat('#fbfbf9', 0.6),
    glass: track(new THREE.MeshStandardMaterial({ color: '#bfe0f2', emissive: '#9fd0ee', emissiveIntensity: 0.55, roughness: 0.1 })),
    filler: mat(finish.door, 0.6),
    dish: mat(l.dishColor, 0.45, l.dishColor.toLowerCase() === '#aeb4ba' ? 0.7 : 0.1),
    ring: mat('#5d6268', 0.4),
    shelf: mat('#e9e3d6', 0.7),
  };
  const edgeMat = track(new THREE.LineBasicMaterial({ color: '#7d858d' }));

  const splashImg = photos.splash ? await loadImage(photos.splash) : null;
  const floorImg = photos.floor ? await loadImage(photos.floor) : null;
  const benchImg = photos.bench && l.benchRepeat > 0 ? await loadImage(photos.bench) : null;
  const benchTex = benchImg ? track(new THREE.Texture(benchImg)) : null;
  // Each repeat is flipped against its neighbour, so the pattern runs on without visible joins.
  if (benchTex) { benchTex.wrapS = benchTex.wrapT = THREE.MirroredRepeatWrapping; benchTex.colorSpace = THREE.SRGBColorSpace; benchTex.anisotropy = 8; benchTex.needsUpdate = true; }
  const splashTile = track(tileTexture(splashImg, l.tileW || 300, l.tileH || 300, splashImg ? l.splashRepeat : 0, '#e6ecef', '#f5f5f2', { color: l.splashTint, pct: l.splashTintPct }));
  const floorTile = track(tileTexture(floorImg, l.floorTileW || 600, l.floorTileH || 600, 0, '#cfd3d6', '#b9bdc0'));

  // A box placed relative to a starting point and direction: `a` runs along it, `d` is to its left
  // as you travel (into the room for a wall), `h` is height.
  const frame = (ox: number, oy: number, th: number, parent: THREE.Object3D = scene) => {
    const dx = Math.cos(th);
    const dz = Math.sin(th);
    return (a0: number, a1: number, d0: number, d1: number, h0: number, h1: number, material: THREE.Material | THREE.Material[], edges = false) => {
      if (a1 - a0 <= 0 || h1 - h0 <= 0 || d1 - d0 <= 0) return null;
      const geo = track(new THREE.BoxGeometry((a1 - a0) * MM, (h1 - h0) * MM, (d1 - d0) * MM));
      const m = new THREE.Mesh(geo, material);
      const a = (a0 + a1) / 2;
      const d = (d0 + d1) / 2;
      m.position.set((ox + dx * a - dz * d) * MM, ((h0 + h1) / 2) * MM, (oy + dz * a + dx * d) * MM);
      m.rotation.y = -th;
      // Outlines help the plain view read clearly; with realistic lighting, shadows do that job.
      if (edges && !realistic) m.add(new THREE.LineSegments(track(new THREE.EdgesGeometry(geo)), edgeMat));
      parent.add(m);
      return m;
    };
  };
  const boxOn = (w: Wall) => frame(w.x, w.y, (w.dir * Math.PI) / 180);
  // When the whole room is drawn, its own walls replace the plain sheet behind each kitchen run.
  const fullRoom = l.roomWalls.length > 0;

  const bounds = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
  const inward = new THREE.Vector2();

  for (const w of l.walls) {
    const box = boxOn(w);
    const len = wallWidth(w);
    const th = (w.dir * Math.PI) / 180;
    inward.x += -Math.sin(th);
    inward.y += Math.cos(th);
    for (const a of [0, len]) for (const d of [0, 700]) {
      const px = w.x + Math.cos(th) * a - Math.sin(th) * d;
      const pz = w.y + Math.sin(th) * a + Math.cos(th) * d;
      bounds.minX = Math.min(bounds.minX, px); bounds.maxX = Math.max(bounds.maxX, px);
      bounds.minZ = Math.min(bounds.minZ, pz); bounds.maxZ = Math.max(bounds.maxZ, pz);
    }

    // The wall itself, and a window if it has one.
    if (!fullRoom) {
      // A one-sided sheet: seen from inside it is the wall, from outside it vanishes so you can look in.
      const sheet = new THREE.Mesh(track(new THREE.PlaneGeometry(len * MM, l.ceiling * MM)), M.wall);
      sheet.position.set((w.x + Math.cos(th) * (len / 2)) * MM, (l.ceiling / 2) * MM, (w.y + Math.sin(th) * (len / 2)) * MM);
      sheet.rotation.y = -th;
      scene.add(sheet);
    }
    if (w.window && !fullRoom) {
      const v = w.window;
      box(v.from, v.from + v.w, -92, 16, v.sill, v.sill + v.h, M.frame);
      box(v.from + 45, v.from + v.w - 45, -93, 18, v.sill + 45, v.sill + v.h - 45, M.glass);
      box(v.from + v.w / 2 - 20, v.from + v.w / 2 + 20, -93, 20, v.sill + 45, v.sill + v.h - 45, M.frame);
    }

    const handleV = (at: number, top: number) => box(at - 6, at + 6, BASE_D, BASE_D + 28, top - 200, top - 40, M.handle);
    const handleUpper = (at: number, bottom: number) => box(at - 6, at + 6, UPPER_D, UPPER_D + 28, bottom + 40, bottom + 200, M.handle);
    const doors = (a: number, wd: number, h0: number, h1: number, depth: number, upper: boolean) => {
      const n = wd > 500 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const a0 = a + (wd / n) * i;
        box(a0 + 1.5, a0 + wd / n - 1.5, 0, depth, h0, h1, M.door, true);
        if (wd / n < 200) continue; // too narrow for a handle
        const at = n === 2 ? (i === 0 ? a0 + wd / n - 45 : a0 + 45) : a0 + wd - 45;
        if (upper) handleUpper(at, h0); else handleV(at, h1);
      }
    };

    // Units on the floor.
    let a = 0;
    let ovenAt: number | null = null;
    const lo = l.toeKick;
    const hi = l.toeKick + l.baseH;
    let run: [number, number] | null = null;
    const runs: [number, number][] = [];
    const tops = (s: Segment) => s.kind !== 'tall' && s.kind !== 'fridge' && s.kind !== 'gap';
    for (const s of w.base) {
      const b = a + s.w;
      if (tops(s)) { if (run) run[1] = b; else runs.push((run = [a, b])); } else run = null;
      if (s.kind === 'tall') {
        box(a, b, 40, 540, 0, lo, M.toe);
        doors(a, s.w, lo, bench - l.benchT, BASE_D, false);
        doors(a, s.w, bench - l.benchT + 3, l.tallH, BASE_D, true);
      } else if (s.kind === 'fridge') {
        // Drawn at its real size, centred in its space, so you can see how far it stands out.
        const fw = l.fridgeW > 0 ? Math.min(l.fridgeW, s.w) : s.w - 24;
        const f0 = a + (s.w - fw) / 2;
        const fd = l.fridgeD || 690;
        const fh = l.fridgeH || 1790;
        box(f0, f0 + fw, 0, fd, 0, fh * 0.36, M.steel, true);
        box(f0, f0 + fw / 2 - 2, 0, fd, fh * 0.36 + 6, fh, M.steel, true);
        box(f0 + fw / 2 + 2, f0 + fw, 0, fd, fh * 0.36 + 6, fh, M.steel, true);
      } else if (s.kind !== 'gap') {
        box(a, b, 40, 540, 0, lo, M.toe);
        if (s.kind === 'oven') {
          // The oven at its real height, hung just under the bench, with a steel control strip and handle.
          box(a, b, 0, BASE_D, lo, hi, M.door, true);
          const top = hi - 8;
          const bottom = Math.max(lo + 10, top - (l.ovenH || 598));
          box(a + 2, b - 2, BASE_D, BASE_D + 10, bottom, top - 95, M.black);
          box(a + 2, b - 2, BASE_D, BASE_D + 10, top - 95, top, M.steel, true);
          box(a + 45, b - 45, BASE_D + 10, BASE_D + 45, top - 135, top - 121, M.handle);
          ovenAt = (a + b) / 2;
        } else if (s.kind === 'dishwasher') {
          box(a + 2, b - 2, 0, BASE_D - 15, 60, hi, M.dish, true);
          box(a + 2, b - 2, 0, BASE_D - 5, hi - 110, hi, M.dish, true);
          box(a + 70, b - 70, BASE_D - 5, BASE_D + 30, hi - 150, hi - 136, M.handle);
        } else if (s.kind === 'drawers') {
          let h = lo;
          for (const part of [0.42, 0.34, 0.24]) {
            const top = h + l.baseH * part;
            box(a + 1.5, b - 1.5, 0, BASE_D, h + 1.5, top - 1.5, M.door, true);
            box((a + b) / 2 - 80, (a + b) / 2 + 80, BASE_D, BASE_D + 28, top - 60, top - 48, M.handle);
            h = top;
          }
        } else if (s.kind === 'filler') {
          box(a, b, 0, BASE_D, lo, hi, M.filler, true);
        } else {
          doors(a, s.w, lo, hi, BASE_D, false);
          if (s.kind === 'sink') {
            const c = (a + b) / 2;
            const half = Math.min(s.w, 800) * 0.46;
            box(c - half, c + half, 90, 500, bench - 1, bench + 4, M.steel);
            box(c - half + 30, c + half - 30, 120, 470, bench + 1, bench + 5, M.black);
            box(c - 9, c + 9, 40, 58, bench, bench + 300, M.handle);
            box(c - 9, c + 9, 40, 220, bench + 290, bench + 308, M.handle);
          }
        }
      }
      a = b;
    }
    for (const [r0, r1] of runs) {
      if (!benchTex) { box(r0, r1, 0, BASE_D + 25, bench - l.benchT, bench, M.bench, true); continue; }
      // The benchtop pattern, at its real size on the top and along the front edge.
      const face = (across: number, up: number) => {
        const t = track(benchTex.clone());
        t.needsUpdate = true;
        // benchRepeat is the real width the photo shows; its height follows from the photo's shape.
        t.repeat.set(across / l.benchRepeat, up / ((l.benchRepeat * benchImg!.height) / benchImg!.width));
        return track(new THREE.MeshStandardMaterial({ map: t, roughness: 0.35 }));
      };
      const top = face(r1 - r0, BASE_D + 25);
      const front = face(r1 - r0, l.benchT);
      const end = face(BASE_D + 25, l.benchT);
      box(r0, r1, 0, BASE_D + 25, bench - l.benchT, bench, [end, end, top, top, front, front], true);
    }
    if (ovenAt !== null && w.hobW > 0) {
      // The cooktop at its real size, with a ring for each cooking zone.
      const hd = l.hobD || 510;
      const d0 = Math.max(30, (BASE_D + 25 - hd) / 2);
      box(ovenAt - w.hobW / 2, ovenAt + w.hobW / 2, d0, d0 + hd, bench, bench + 6, M.black);
      const zones: [number, number, number][] = l.hobZones >= 5
        ? [[-0.34, 0.3, 95], [-0.34, 0.72, 80], [0, 0.5, 130], [0.34, 0.3, 80], [0.34, 0.72, 95]]
        : [[-0.25, 0.3, 100], [-0.25, 0.72, 80], [0.25, 0.3, 80], [0.25, 0.72, 100]];
      const th = (w.dir * Math.PI) / 180;
      for (const [fx, fy, r] of zones.slice(0, l.hobZones || 4)) {
        const al = ovenAt + fx * w.hobW;
        const dp = d0 + fy * hd;
        const ring = new THREE.Mesh(track(new THREE.RingGeometry((r - 5) * MM, r * MM, 40)), M.ring);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set((w.x + Math.cos(th) * al - Math.sin(th) * dp) * MM, (bench + 7) * MM, (w.y + Math.sin(th) * al + Math.cos(th) * dp) * MM);
        scene.add(ring);
      }
    }

    // Splashback, tiled from the bench up, on every stretch of wall that has a bench in front of it.
    if (o.splash > 0) {
      let s0: number | null = null;
      let at = 0;
      const stretches: [number, number][] = [];
      for (const s of w.base) {
        const tiled = s.kind !== 'tall' && s.kind !== 'fridge';
        if (tiled && s0 === null) s0 = at;
        if (!tiled && s0 !== null) { stretches.push([s0, at]); s0 = null; }
        at += s.w;
      }
      if (s0 !== null) stretches.push([s0, at]);
      // One tiled piece of wall. Every piece counts its tiles from the same corner, so the rows and joints line up.
      const tiles = (a0: number, a1: number, h0: number, h1: number) => {
        if (a1 - a0 < 1 || h1 - h0 < 1) return;
        const tw = l.tileW || 300;
        const thh = l.tileH || 300;
        const t = track(splashTile.clone());
        t.needsUpdate = true;
        t.repeat.set((a1 - a0) / tw, (h1 - h0) / thh);
        t.offset.set((a0 % tw) / tw, ((h0 - bench) % thh) / thh);
        const face = track(new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
        box(a0, a1, 0, 9, h0, h1, [M.wall, M.wall, M.wall, M.wall, face, M.wall]);
      };
      const win = w.window;
      for (const [r0, r1] of stretches) {
        if (!win || win.from >= r1 || win.from + win.w <= r0 || win.sill >= f.underside) {
          tiles(r0, r1, bench, f.underside);
          continue;
        }
        // Tile up to the sill under the window, and full height either side of it. Never across the glass.
        const w0 = Math.max(r0, win.from);
        const w1 = Math.min(r1, win.from + win.w);
        tiles(r0, w0, bench, f.underside);
        tiles(w0, w1, bench, Math.min(f.underside, win.sill));
        tiles(w1, r1, bench, f.underside);
        // And above the window, if the tiles go higher than its top.
        tiles(w0, w1, win.sill + win.h, f.underside);
      }
    }

    // Units on the wall.
    a = 0;
    for (const s of w.upper) {
      const b = a + s.w;
      const u0 = s.lo ?? f.underside;
      const u1 = s.hi ?? f.top;
      if (s.kind === 'filler') box(a, b, 0, UPPER_D, u0, u1, M.filler, true);
      else if (s.kind === 'open') {
        // An open box: back, sides, top and bottom, with a middle shelf if it is tall enough.
        box(a, b, 0, 16, u0, u1, M.shelf, true);
        box(a, a + 16, 0, UPPER_D, u0, u1, M.door, true);
        box(b - 16, b, 0, UPPER_D, u0, u1, M.door, true);
        box(a, b, 0, UPPER_D, u0, u0 + 16, M.door, true);
        box(a, b, 0, UPPER_D, u1 - 16, u1, M.door, true);
        if (u1 - u0 > 500) box(a + 16, b - 16, 0, UPPER_D - 10, (u0 + u1) / 2 - 8, (u0 + u1) / 2 + 8, M.shelf, true);
      } else if (s.kind !== 'gap') {
        doors(a, s.w, u0, u1, UPPER_D, true);
        if (s.kind === 'hood') {
          // An undermount rangehood sits up inside the cabinet; only its steel underside shows.
          const hw = l.hoodW > 0 ? Math.min(l.hoodW, s.w) : s.w - 50;
          const c = (a + b) / 2;
          box(c - hw / 2, c + hw / 2, 30, 30 + (l.hoodD || 290), u0 - 10, u0, M.steel, true);
        }
      }
      a = b;
    }
  }

  // The extent of the kitchen runs alone, before the rest of the room is added.
  const kb = { ...bounds };
  const tw = l.floorTileW || 600;
  const tl = l.floorTileH || 600;
  const floorPlane = (x: number, y: number, w: number, d: number, material: THREE.Material, lift = 0) => {
    const m = new THREE.Mesh(track(new THREE.PlaneGeometry(w * MM, d * MM)), material);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x + w / 2) * MM, lift * MM, (y + d / 2) * MM);
    scene.add(m);
  };
  if (l.zones.length) {
    for (const z of l.zones) {
      if (z.floor === 'tile') {
        // Tiles line up across neighbouring areas because every area counts from the same corner of the room.
        const t = track(floorTile.clone());
        t.needsUpdate = true;
        t.repeat.set(z.w / tw, z.d / tl);
        t.offset.set((((z.x % tw) + tw) % tw) / tw, 0);
        floorPlane(z.x, z.y, z.w, z.d, track(new THREE.MeshStandardMaterial({ map: t, roughness: 0.35 })));
      } else {
        const colour = z.floor === 'carpet' ? '#b7ab97' : z.floor === 'deck' ? '#c6cace' : '#d9d9d6';
        floorPlane(z.x, z.y, z.w, z.d, mat(colour, z.floor === 'carpet' ? 1 : 0.6));
      }
      bounds.minX = Math.min(bounds.minX, z.x); bounds.maxX = Math.max(bounds.maxX, z.x + z.w);
      bounds.minZ = Math.min(bounds.minZ, z.y); bounds.maxZ = Math.max(bounds.maxZ, z.y + z.d);
    }
  } else {
    // Only the kitchen is drawn: stretch a floor a little past the units, but never out through a wall.
    const margin = 1500;
    let { minX, maxX, minZ, maxZ } = bounds;
    minX -= margin; maxX += margin; minZ -= margin; maxZ += margin;
    for (const w of l.walls) {
      if (w.dir === 0) minZ = Math.max(minZ, w.y);
      else if (w.dir === 90) maxX = Math.min(maxX, w.x);
      else if (w.dir === 180) maxZ = Math.min(maxZ, w.y);
      else minX = Math.max(minX, w.x);
    }
    floorTile.repeat.set((maxX - minX) / tw, (maxZ - minZ) / tl);
    floorPlane(minX, minZ, maxX - minX, maxZ - minZ, track(new THREE.MeshStandardMaterial({ map: floorTile, roughness: 0.35 })));
  }

  // The walls of the room, with their windows and doors.
  const glass = track(new THREE.MeshStandardMaterial({ color: '#cfe8f5', transparent: true, opacity: 0.22, roughness: 0.05 }));
  const hideable: { group: THREE.Group; px: number; pz: number; nx: number; nz: number }[] = [];
  if (fullRoom) {
    const inside = l.zones.filter((z) => z.floor !== 'deck');
    const mx = inside.reduce((n, z) => n + z.x + z.w / 2, 0) / Math.max(1, inside.length);
    const mz = inside.reduce((n, z) => n + z.y + z.d / 2, 0) / Math.max(1, inside.length);
    for (const rw of l.roomWalls) {
      let { x1, y1, x2, y2 } = rw;
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 1) continue;
      let openings = rw.openings;
      // Face the wall's "into the room" side towards the middle of the house.
      let th = Math.atan2(y2 - y1, x2 - x1);
      const towards = -Math.sin(th) * (mx - x1) + Math.cos(th) * (mz - y1);
      if (towards < 0) {
        [x1, y1, x2, y2] = [x2, y2, x1, y1];
        th = Math.atan2(y2 - y1, x2 - x1);
        openings = openings.map((o) => ({ ...o, from: len - o.from - o.w }));
      }
      const group = new THREE.Group();
      scene.add(group);
      const box = frame(x1, y1, th, group);
      const d0 = rw.outer ? -100 : -45;
      const d1 = rw.outer ? 0 : 45;
      let at = 0;
      for (const o of [...openings].sort((p, q) => p.from - q.from)) {
        box(at, o.from, d0, d1, 0, l.ceiling, M.wall);
        box(o.from, o.from + o.w, d0, d1, 0, o.sill, M.wall);
        box(o.from, o.from + o.w, d0, d1, o.sill + o.h, l.ceiling, M.wall);
        if (o.kind !== 'door') {
          const mid = (d0 + d1) / 2;
          box(o.from, o.from + o.w, mid - 4, mid + 4, o.sill, o.sill + o.h, glass);
          box(o.from + o.w / 2 - 18, o.from + o.w / 2 + 18, mid - 20, mid + 20, o.sill, o.sill + o.h, M.frame);
          box(o.from, o.from + o.w, mid - 20, mid + 20, o.sill + o.h - 36, o.sill + o.h, M.frame);
          if (o.sill > 0) box(o.from, o.from + o.w, mid - 20, mid + 20, o.sill, o.sill + 36, M.frame);
        }
        at = o.from + o.w;
      }
      box(at, len, d0, d1, 0, l.ceiling, M.wall);
      if (rw.outer) hideable.push({ group, px: x1 * MM, pz: y1 * MM, nx: -Math.sin(th), nz: Math.cos(th) });
    }
  }

  for (const it of l.items) addFurniture(it);

  function addFurniture(it: Furniture): void {
    const box = frame(it.x, it.y, (it.rot * Math.PI) / 180);
    const main = mat(it.color, 0.6);
    const dark = mat(new THREE.Color(it.color).multiplyScalar(0.7).getStyle(), 0.7);
    const hw = it.w / 2;
    const hd = it.d / 2;
    if (it.kind === 'rug') {
      box(-hw, hw, -hd, hd, 2, 14, main);
      box(-hw + 120, hw - 120, -hd + 120, hd - 120, 14, 16, dark);
    } else if (it.kind === 'sofa') {
      box(-hw, hw, -hd, hd, 0, it.h * 0.48, main, true);
      box(-hw, hw, hd - 220, hd, it.h * 0.48, it.h, main, true);
      box(-hw, -hw + 180, -hd, hd - 220, it.h * 0.48, it.h * 0.72, main, true);
      box(hw - 180, hw, -hd, hd - 220, it.h * 0.48, it.h * 0.72, main, true);
    } else if (it.kind === 'table') {
      box(-hw, hw, -hd, hd, it.h - 45, it.h, main, true);
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const cx = sx * (hw - 80);
        const cy = sy * (hd - 80);
        box(cx - 40, cx + 40, cy - 40, cy + 40, 0, it.h - 45, dark);
      }
      // Chairs: one at each end when there are enough, the rest shared along the two long sides.
      const ends = it.chairs >= 6 ? 2 : 0;
      const perSide = Math.floor((it.chairs - ends) / 2);
      const chair = (cx: number, cy: number, backX: number, backY: number) => {
        box(cx - 220, cx + 220, cy - 220, cy + 220, 420, 460, dark, true);
        for (const [lx, ly] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(cx + lx * 190 - 20, cx + lx * 190 + 20, cy + ly * 190 - 20, cy + ly * 190 + 20, 0, 420, dark);
        const bx = cx + backX * 200;
        const by = cy + backY * 200;
        if (backX) box(bx - 20, bx + 20, cy - 220, cy + 220, 460, 980, dark, true);
        else box(cx - 220, cx + 220, by - 20, by + 20, 460, 980, dark, true);
      };
      for (let i = 0; i < perSide; i++) {
        const cx = -hw + (it.w / perSide) * (i + 0.5);
        chair(cx, -hd - 130, 0, -1);
        chair(cx, hd + 130, 0, 1);
      }
      if (ends) { chair(-hw - 130, 0, -1, 0); chair(hw + 130, 0, 1, 0); }
    } else {
      box(-hw, hw, -hd, hd, it.lift || 0, (it.lift || 0) + it.h, main, true);
    }
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  // Soft all-round reflections, so steel and handles look like metal rather than black.
  const pmrem = track(new THREE.PMREMGenerator(renderer));
  scene.environment = track(pmrem.fromScene(new RoomEnvironment(), 0.04)).texture;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  el.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';

  const indoor = l.zones.filter((z) => z.floor !== 'deck');
  const room = indoor.length
    ? { x0: Math.min(...indoor.map((z) => z.x)), x1: Math.max(...indoor.map((z) => z.x + z.w)), z0: Math.min(...indoor.map((z) => z.y)), z1: Math.max(...indoor.map((z) => z.y + z.d)) }
    : { x0: kb.minX, x1: kb.maxX, z0: kb.minZ, z1: kb.maxZ };

  if (!realistic) {
    scene.add(new THREE.HemisphereLight('#ffffff', '#cfc8bc', 1.0));
    const sun = new THREE.DirectionalLight('#ffffff', 0.6);
    sun.position.set(-3, 6, 4);
    scene.add(sun);
    scene.environmentIntensity = 0.45;
    renderer.toneMapping = THREE.NeutralToneMapping;
  } else {
    // A ceiling (seen only from below), daylight coming in from outside, and warm downlights.
    const ceilMat = track(new THREE.MeshStandardMaterial({ color: '#f7f5f0', roughness: 0.95, side: THREE.BackSide }));
    const zonesForCeiling = indoor.length ? indoor : [{ x: room.x0, y: room.z0, w: room.x1 - room.x0, d: room.z1 - room.z0 }];
    for (const z of zonesForCeiling) {
      const c = new THREE.Mesh(track(new THREE.PlaneGeometry(z.w * MM, z.d * MM)), ceilMat);
      c.rotation.x = -Math.PI / 2;
      c.position.set((z.x + z.w / 2) * MM, l.ceiling * MM, (z.y + z.d / 2) * MM);
      c.userData.noShadow = true;
      scene.add(c);
    }
    scene.add(new THREE.HemisphereLight('#f4f7ff', '#cbbfae', 0.22));
    const cxm = ((room.x0 + room.x1) / 2) * MM;
    const czm = ((room.z0 + room.z1) / 2) * MM;
    const span = Math.max(room.x1 - room.x0, room.z1 - room.z0) * MM;
    const sun = new THREE.DirectionalLight('#fff3df', 1.5);
    sun.position.set(cxm - span * 0.35, span * 1.1, room.z0 * MM - span * 0.9);
    sun.target.position.set(cxm, 0, czm);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -span; sun.shadow.camera.right = span;
    sun.shadow.camera.top = span; sun.shadow.camera.bottom = -span;
    sun.shadow.camera.near = 0.5; sun.shadow.camera.far = span * 4;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);
    const discMat = track(new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff1d6', emissiveIntensity: 2.2 }));
    const nx = Math.max(1, Math.min(3, Math.round((room.x1 - room.x0) / 2300)));
    const nz = Math.max(1, Math.min(3, Math.round((room.z1 - room.z0) / 2300)));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const px = (room.x0 + ((room.x1 - room.x0) * (i + 0.5)) / nx) * MM;
      const pz = (room.z0 + ((room.z1 - room.z0) * (j + 0.5)) / nz) * MM;
      const lamp = new THREE.PointLight('#ffe9c7', 1.15, 6, 1.6);
      lamp.position.set(px, (l.ceiling - 120) * MM, pz);
      scene.add(lamp);
      const disc = new THREE.Mesh(track(new THREE.CircleGeometry(0.055, 24)), discMat);
      disc.rotation.x = Math.PI / 2;
      disc.position.set(px, (l.ceiling - 3) * MM, pz);
      disc.userData.noShadow = true;
      scene.add(disc);
    }
    scene.environmentIntensity = 0.16;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.noShadow) return;
      const see = Array.isArray(m.material) ? false : (m.material as THREE.Material).transparent;
      m.castShadow = !see && !(m.geometry instanceof THREE.PlaneGeometry);
      m.receiveShadow = !see;
    });
  }

  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 60);
  const controls = new OrbitControls(camera, renderer.domElement);
  if (inward.length() < 0.01) inward.set(0, 1);
  inward.normalize();
  const view = (which: string) => {
    const facing = l.walls.find((w) => w.id === which);
    if (facing) {
      // Standing back from the middle of one kitchen wall, looking straight at it.
      const th = (facing.dir * Math.PI) / 180;
      const mid = wallWidth(facing) / 2;
      const px = (facing.x + Math.cos(th) * mid) * MM;
      const pz = (facing.y + Math.sin(th) * mid) * MM;
      const back = Math.max(2.4, mid * MM * 1.15);
      camera.position.set(px - Math.sin(th) * back, 1.5, pz + Math.cos(th) * back);
      controls.target.set(px, 1.25, pz);
      controls.update();
      return;
    }
    const indoor = l.zones.filter((z) => z.floor !== 'deck');
    if (which === 'room' && indoor.length) {
      // High up over one corner, looking across the whole floor.
      const x0 = Math.min(...indoor.map((z) => z.x));
      const x1 = Math.max(...indoor.map((z) => z.x + z.w));
      const z0 = Math.min(...indoor.map((z) => z.y));
      const z1 = Math.max(...indoor.map((z) => z.y + z.d));
      const R = Math.max(x1 - x0, z1 - z0) * MM;
      const mx = ((x0 + x1) / 2) * MM;
      const mz = ((z0 + z1) / 2) * MM;
      camera.position.set(mx - inward.x * R * 0.15 - R * 0.55, R * 1.0, mz + R * 0.95);
      controls.target.set(mx, 0.6, mz - R * 0.08);
    } else {
      // Standing in the open side of the kitchen, looking in.
      const cx = ((kb.minX + kb.maxX) / 2) * MM;
      const cz = ((kb.minZ + kb.maxZ) / 2) * MM;
      const reach = Math.max(kb.maxX - kb.minX, kb.maxZ - kb.minZ) * MM;
      camera.position.set(cx + inward.x * reach * 1.15, 1.8, cz + inward.y * reach * 1.15);
      controls.target.set(cx - inward.x * reach * 0.1, 1.15, cz - inward.y * reach * 0.1);
    }
    controls.update();
  };
  if (keep) {
    camera.position.set(...keep.pos);
    controls.target.set(...keep.target);
  } else {
    view(fullRoom ? 'room' : 'kitchen');
  }
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 0.4;
  controls.maxDistance = fullRoom ? 30 : 14;

  const size = () => {
    const wpx = Math.max(1, el.clientWidth);
    const hpx = Math.max(1, el.clientHeight);
    renderer.setSize(wpx, hpx, false);
    renderer.domElement.style.width = `${wpx}px`;
    renderer.domElement.style.height = `${hpx}px`;
    camera.aspect = wpx / hpx;
    camera.updateProjectionMatrix();
  };
  size();
  const ro = new ResizeObserver(size);
  ro.observe(el);

  // With realistic lighting, add soft shading where surfaces meet (under cabinets, in corners).
  let composer: EffectComposer | null = null;
  if (realistic) {
    try {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const ao = new GTAOPass(scene, camera, el.clientWidth || 800, el.clientHeight || 600);
      ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.2, thickness: 1.4, scale: 1.5, samples: 16 });
      composer.addPass(ao);
      composer.addPass(new OutputPass());
    } catch {
      composer = null; // not supported on this device: carry on without it
    }
  }
  const resizeComposer = () => composer?.setSize(Math.max(1, el.clientWidth), Math.max(1, el.clientHeight));
  resizeComposer();
  const ro2 = new ResizeObserver(resizeComposer);
  ro2.observe(el);

  let alive = true;
  const tick = () => {
    if (!alive) return;
    controls.update();
    // Outside walls disappear when you are looking in from behind them.
    for (const h of hideable) h.group.visible = (camera.position.x - h.px) * h.nx + (camera.position.z - h.pz) * h.nz > 0;
    if (composer) composer.render(); else renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  tick();

  return {
    dispose() {
      alive = false;
      ro.disconnect();
      ro2.disconnect();
      composer?.dispose();
      controls.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
    view,
    picture: () => { if (composer) composer.render(); else renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
    camera: () => ({ pos: camera.position.toArray() as [number, number, number], target: controls.target.toArray() as [number, number, number] }),
  };
}
