// Builds a 3D model of the kitchen from the wall lists. Loaded only when the 3D view is opened.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { type HeightOption, type Layout, type Segment, type Wall, benchTop, optionFacts, wallWidth } from './layout';

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
function tileTexture(img: HTMLImageElement | null, tileW: number, tileH: number, repeatMm: number, plain: string, grout: string): THREE.CanvasTexture {
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
    shelf: mat('#e9e3d6', 0.7),
  };
  const edgeMat = track(new THREE.LineBasicMaterial({ color: '#7d858d' }));

  const splashImg = photos.splash ? await loadImage(photos.splash) : null;
  const floorImg = photos.floor ? await loadImage(photos.floor) : null;
  const benchImg = photos.bench && l.benchRepeat > 0 ? await loadImage(photos.bench) : null;
  const benchTex = benchImg ? track(new THREE.Texture(benchImg)) : null;
  if (benchTex) { benchTex.wrapS = benchTex.wrapT = THREE.RepeatWrapping; benchTex.colorSpace = THREE.SRGBColorSpace; benchTex.anisotropy = 8; benchTex.needsUpdate = true; }
  const splashTile = track(tileTexture(splashImg, l.tileW || 300, l.tileH || 300, splashImg ? l.splashRepeat : 0, '#e6ecef', '#f5f5f2'));
  const floorTile = track(tileTexture(floorImg, l.floorTileW || 600, l.floorTileH || 600, 0, '#cfd3d6', '#b9bdc0'));

  // A box placed relative to a wall: `a` runs along the wall, `d` comes out into the room, `h` is height.
  const boxOn = (w: Wall) => {
    const th = (w.dir * Math.PI) / 180;
    const dx = Math.cos(th);
    const dz = Math.sin(th);
    return (a0: number, a1: number, d0: number, d1: number, h0: number, h1: number, material: THREE.Material | THREE.Material[], edges = false) => {
      if (a1 - a0 <= 0 || h1 - h0 <= 0) return null;
      const geo = track(new THREE.BoxGeometry((a1 - a0) * MM, (h1 - h0) * MM, (d1 - d0) * MM));
      const m = new THREE.Mesh(geo, material);
      const a = (a0 + a1) / 2;
      const d = (d0 + d1) / 2;
      m.position.set((w.x + dx * a - dz * d) * MM, ((h0 + h1) / 2) * MM, (w.y + dz * a + dx * d) * MM);
      m.rotation.y = -th;
      if (edges) m.add(new THREE.LineSegments(track(new THREE.EdgesGeometry(geo)), edgeMat));
      scene.add(m);
      return m;
    };
  };

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
    {
      // A one-sided sheet: seen from inside it is the wall, from outside it vanishes so you can look in.
      const sheet = new THREE.Mesh(track(new THREE.PlaneGeometry(len * MM, l.ceiling * MM)), M.wall);
      sheet.position.set((w.x + Math.cos(th) * (len / 2)) * MM, (l.ceiling / 2) * MM, (w.y + Math.sin(th) * (len / 2)) * MM);
      sheet.rotation.y = -th;
      scene.add(sheet);
    }
    if (w.window) {
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
        box(a + 12, b - 12, 0, 690, 0, 640, M.steel, true);
        box(a + 12, a + s.w / 2 - 2, 0, 690, 648, 1790, M.steel, true);
        box(a + s.w / 2 + 2, b - 12, 0, 690, 648, 1790, M.steel, true);
      } else if (s.kind !== 'gap') {
        box(a, b, 40, 540, 0, lo, M.toe);
        if (s.kind === 'oven') {
          box(a, b, 0, BASE_D, lo, hi, M.door, true);
          box(a + 14, b - 14, BASE_D, BASE_D + 8, lo + 60, hi - 12, M.black);
          box(a + 40, b - 40, BASE_D + 8, BASE_D + 40, hi - 110, hi - 96, M.handle);
          ovenAt = (a + b) / 2;
        } else if (s.kind === 'dishwasher') {
          box(a + 3, b - 3, 0, BASE_D, 0 + 60, hi, M.steel, true);
          box(a + 60, b - 60, BASE_D, BASE_D + 35, hi - 90, hi - 76, M.handle);
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
        t.repeat.set(across / l.benchRepeat, up / l.benchRepeat);
        return track(new THREE.MeshStandardMaterial({ map: t, roughness: 0.35 }));
      };
      const top = face(r1 - r0, BASE_D + 25);
      const front = face(r1 - r0, l.benchT);
      const end = face(BASE_D + 25, l.benchT);
      box(r0, r1, 0, BASE_D + 25, bench - l.benchT, bench, [end, end, top, top, front, front], true);
    }
    if (ovenAt !== null && w.hobW > 0) box(ovenAt - w.hobW / 2, ovenAt + w.hobW / 2, 55, 555, bench, bench + 8, M.black);

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
      for (const [r0, r1] of stretches) {
        const t = track(splashTile.clone());
        t.needsUpdate = true;
        t.repeat.set((r1 - r0) / (l.tileW || 300), o.splash / (l.tileH || 300));
        const face = track(new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
        box(r0, r1, 0, 9, bench, f.underside, [M.wall, M.wall, M.wall, M.wall, face, M.wall]);
      }
    }

    // Units on the wall.
    a = 0;
    for (const s of w.upper) {
      const b = a + s.w;
      if (s.kind === 'filler') box(a, b, 0, UPPER_D, f.underside, f.top, M.filler, true);
      else if (s.kind === 'open') {
        box(a, b, 0, UPPER_D, f.underside, f.underside + 18, M.shelf, true);
        box(a, b, 0, UPPER_D, (f.underside + f.top) / 2 - 9, (f.underside + f.top) / 2 + 9, M.shelf, true);
        box(a, b, 0, UPPER_D, f.top - 18, f.top, M.shelf, true);
      } else if (s.kind !== 'gap') {
        doors(a, s.w, f.underside, f.top, UPPER_D, true);
        if (s.kind === 'hood') box(a + 25, b - 25, 20, UPPER_D + 60, f.underside - 28, f.underside, M.steel);
      }
      a = b;
    }
  }

  // Floor: stretch a little past the units, but never out through a wall.
  const margin = 1500;
  let { minX, maxX, minZ, maxZ } = bounds;
  minX -= margin; maxX += margin; minZ -= margin; maxZ += margin;
  for (const w of l.walls) {
    if (w.dir === 0) minZ = Math.max(minZ, w.y);
    else if (w.dir === 90) maxX = Math.min(maxX, w.x);
    else if (w.dir === 180) maxZ = Math.min(maxZ, w.y);
    else minX = Math.max(minX, w.x);
  }
  const fw = maxX - minX;
  const fd = maxZ - minZ;
  floorTile.repeat.set(fw / (l.floorTileW || 600), fd / (l.floorTileH || 600));
  const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(fw * MM, fd * MM)), track(new THREE.MeshStandardMaterial({ map: floorTile, roughness: 0.35 })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(((minX + maxX) / 2) * MM, 0, ((minZ + maxZ) / 2) * MM);
  scene.add(floor);

  scene.add(new THREE.HemisphereLight('#ffffff', '#cfc8bc', 1.0));
  const sun = new THREE.DirectionalLight('#ffffff', 0.6);
  sun.position.set(-3, 6, 4);
  scene.add(sun);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  // Soft all-round reflections, so steel and handles look like metal rather than black.
  const pmrem = track(new THREE.PMREMGenerator(renderer));
  scene.environment = track(pmrem.fromScene(new RoomEnvironment(), 0.04)).texture;
  scene.environmentIntensity = 0.45;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  el.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';

  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 60);
  const cx = ((bounds.minX + bounds.maxX) / 2) * MM;
  const cz = ((bounds.minZ + bounds.maxZ) / 2) * MM;
  const controls = new OrbitControls(camera, renderer.domElement);
  if (keep) {
    camera.position.set(...keep.pos);
    controls.target.set(...keep.target);
  } else {
    if (inward.length() < 0.01) inward.set(0, 1);
    inward.normalize();
    const reach = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * MM;
    camera.position.set(cx + inward.x * reach * 1.15, 1.8, cz + inward.y * reach * 1.15);
    controls.target.set(cx - inward.x * reach * 0.1, 1.15, cz - inward.y * reach * 0.1);
  }
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 0.4;
  controls.maxDistance = 14;

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

  let alive = true;
  const frame = () => {
    if (!alive) return;
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  frame();

  return {
    dispose() {
      alive = false;
      ro.disconnect();
      controls.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
    camera: () => ({ pos: camera.position.toArray() as [number, number, number], target: controls.target.toArray() as [number, number, number] }),
  };
}
