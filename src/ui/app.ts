import { type Drawing, type Pt, scaleDrawing } from '../model/types';
import { parseDxf } from '../io/dxf';
import { type PdfFile, factorFromKnownLength, factorFromPrintedScale, openImage, openPdf } from '../io/raster';
import { Viewport } from '../view/viewport';
import { DARK, PAPER, type Theme, drawDrawing, readable } from '../view/renderer';
import { type Snap, type SnapKind, SNAP_NAMES, findSnap } from '../tools/snap';
import { type MeasureKind, type Measurement, isComplete, pointsNeeded, resultSentence, resultText } from '../tools/measure';
import { fmtLength } from '../model/format';
import { dist } from '../model/geom';

type Mode = 'simple' | 'pro';
type Tool = 'pan' | 'scale' | MeasureKind;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ACCENT = '#e8590c';

const svg = (d: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

interface ToolButton {
  id: string;
  simple: string;
  pro: string;
  key: string;
  icon: string;
  tool?: Tool;
  run?: (app: App) => void;
  gapBefore?: boolean;
}

const BUTTONS: ToolButton[] = [
  { id: 'open', simple: 'Open a file', pro: 'Open', key: 'OPEN', icon: svg('<path d="M3 7h6l2 2h10v10H3z"/>'), run: (a) => a.pickFile() },
  { id: 'pan', simple: 'Move around', pro: 'Pan', key: 'P', icon: svg('<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>'), tool: 'pan', gapBefore: true },
  { id: 'length', simple: 'Measure a length', pro: 'Distance', key: 'DI', icon: svg('<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>'), tool: 'length' },
  { id: 'area', simple: 'Measure an area', pro: 'Area', key: 'AA', icon: svg('<path d="M4 4h16v10h-7v6H4z"/>'), tool: 'area' },
  { id: 'angle', simple: 'Measure an angle', pro: 'Angle', key: 'ANG', icon: svg('<path d="M4 20h16M4 20L16 5"/><path d="M11 20a8 8 0 0 0-2.2-5.5"/>'), tool: 'angle' },
  { id: 'scale', simple: 'Set the scale', pro: 'Scale', key: 'SC', icon: svg('<path d="M3 8v8M21 8v8M3 12h18"/><path d="M8 10v4M12 9v6M16 10v4"/>'), tool: 'scale' },
  { id: 'fit', simple: 'Show whole drawing', pro: 'Zoom extents', key: 'Z', icon: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><rect x="9" y="9" width="6" height="6"/>'), run: (a) => a.fit(), gapBefore: true },
  { id: 'layers', simple: 'Layers', pro: 'Layers', key: 'LA', icon: svg('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'), run: (a) => a.toggleLayers() },
  { id: 'clear', simple: 'Clear measurements', pro: 'Clear', key: 'CLEAR', icon: svg('<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/>'), run: (a) => a.clearMeasurements() },
];

const ALIASES: Record<string, string> = {
  O: 'open', OPEN: 'open',
  P: 'pan', PAN: 'pan',
  DI: 'length', DIST: 'length', MEASURE: 'length', L: 'length',
  AA: 'area', AREA: 'area',
  ANG: 'angle', ANGLE: 'angle',
  SC: 'scale', SCALE: 'scale',
  Z: 'fit', ZE: 'fit', ZOOM: 'fit', FIT: 'fit',
  LA: 'layers', LAYER: 'layers', LAYERS: 'layers',
  CLEAR: 'clear', E: 'clear', ERASE: 'clear',
};

interface Hover {
  pt: Pt;
  sx: number;
  sy: number;
  snap: Snap | null;
  touch: boolean;
}

export class App {
  private root = $('app');
  private canvas = $<HTMLCanvasElement>('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private view = new Viewport();
  private drawing: Drawing | null = null;
  private mode: Mode = 'simple';
  private tool: Tool = 'pan';
  private points: Pt[] = [];
  private measurements: Measurement[] = [];
  private hover: Hover | null = null;
  private snaps = new Set<SnapKind>(['end', 'mid', 'cen', 'int', 'near']);
  private lastCommand = '';
  private lastResult = '';
  private dirty = true;
  private coarse = window.matchMedia('(pointer: coarse)').matches;

  // pointer state
  private pointers = new Map<number, { x: number; y: number; type: string }>();
  private panning = false;
  private picking = false;
  private gesture: { d: number; mx: number; my: number } | null = null;
  private gestureLock = false;
  private spaceHeld = false;
  private toastTimer = 0;
  private pdf: { file: PdfFile; name: string; page: number } | null = null;
  private scaleLine: [Pt, Pt] | null = null;

  constructor() {
    let saved: string | null = null;
    try { saved = localStorage.getItem('planbench.mode'); } catch { /* private window */ }
    this.buildTools();
    this.buildSnaps();
    this.bindUi();
    this.bindPointer();
    this.setMode(saved === 'pro' ? 'pro' : 'simple');
    this.setTool('pan');
    new ResizeObserver(() => this.resize()).observe($('stage'));
    this.resize();
    const loop = () => {
      if (this.dirty) { this.dirty = false; this.render(); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- set-up

  private buildTools(): void {
    const nav = $('tools');
    for (const b of BUTTONS) {
      if (b.gapBefore) nav.insertAdjacentHTML('beforeend', '<div class="gap"></div>');
      const el = document.createElement('button');
      el.type = 'button';
      el.id = `tool-${b.id}`;
      el.innerHTML = `${b.icon}<span class="label"></span><span class="key">${b.key}</span>`;
      el.addEventListener('click', () => this.runButton(b));
      nav.appendChild(el);
    }
  }

  private buildSnaps(): void {
    const box = $('snaps');
    for (const kind of ['end', 'mid', 'cen', 'int', 'near'] as SnapKind[]) {
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = kind.toUpperCase();
      el.title = `Snap: ${SNAP_NAMES[kind]}`;
      el.setAttribute('aria-pressed', 'true');
      el.addEventListener('click', () => {
        if (this.snaps.has(kind)) this.snaps.delete(kind);
        else this.snaps.add(kind);
        el.setAttribute('aria-pressed', String(this.snaps.has(kind)));
      });
      box.appendChild(el);
    }
  }

  private bindUi(): void {
    $('mode-simple').addEventListener('click', () => this.setMode('simple'));
    $('mode-pro').addEventListener('click', () => this.setMode('pro'));
    $('welcome-open').addEventListener('click', () => this.pickFile());
    $('welcome-sample').addEventListener('click', () => void this.openSample());
    $('done').addEventListener('click', () => this.finish());
    $('layers-close').addEventListener('click', () => this.toggleLayers(false));
    $('layers-all').addEventListener('click', () => this.setAllLayers(true));
    $('layers-none').addEventListener('click', () => this.setAllLayers(false));

    $('page-prev').addEventListener('click', () => void this.showPdfPage((this.pdf?.page ?? 1) - 1));
    $('page-next').addEventListener('click', () => void this.showPdfPage((this.pdf?.page ?? 1) + 1));

    const dialog = $<HTMLDialogElement>('scale-dialog');
    $('scale-form').addEventListener('submit', (e) => { e.preventDefault(); this.applyTypedScale(); });
    $('scale-cancel').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      // Closed without setting a scale (Cancel or Esc): forget the line that was marked.
      if (!this.scaleLine) return;
      this.scaleLine = null;
      this.points = [];
      this.updateHint();
      this.dirty = true;
    });
    for (const b of dialog.querySelectorAll<HTMLButtonElement>('[data-scale]')) {
      b.addEventListener('click', () => this.applyPrintedScale(Number(b.dataset.scale)));
    }

    const file = $<HTMLInputElement>('file');
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      file.value = '';
      if (f) void this.openFile(f);
    });

    const stage = $('stage');
    stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('dropping'); });
    stage.addEventListener('dragleave', () => stage.classList.remove('dropping'));
    stage.addEventListener('drop', (e) => {
      e.preventDefault();
      stage.classList.remove('dropping');
      const f = e.dataTransfer?.files?.[0];
      if (f) void this.openFile(f);
    });

    const cmd = $<HTMLInputElement>('cmd');
    cmd.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || (e.key === ' ' && cmd.value.trim() === '')) {
        e.preventDefault();
        const text = cmd.value.trim().toUpperCase();
        cmd.value = '';
        this.command(text);
      } else if (e.key === 'Escape') {
        cmd.value = '';
        cmd.blur();
        this.cancel();
      }
      e.stopPropagation();
    });

    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      if ((t instanceof HTMLInputElement && t.type === 'text') || t instanceof HTMLSelectElement) return;
      if ($<HTMLDialogElement>('scale-dialog').open) return;
      if (e.key === 'Escape') this.cancel();
      else if (e.key === 'Enter') { e.preventDefault(); this.finish(); }
      else if (e.key === ' ') { e.preventDefault(); this.spaceHeld = true; this.canvas.style.cursor = 'grab'; }
      else if (this.mode === 'pro' && e.key.length === 1 && /[a-z?]/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) cmd.focus();
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === ' ') { this.spaceHeld = false; this.updateCursor(); }
    });
  }

  // ---------------------------------------------------------------- files

  pickFile(): void {
    $<HTMLInputElement>('file').click();
  }

  async openSample(): Promise<void> {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}samples/flat.dxf`);
      if (!res.ok) throw new Error('missing');
      this.load(parseDxf(await res.text(), 'Sample flat plan'));
    } catch {
      this.toast('The sample plan could not be loaded.');
    }
  }

  async openFile(f: File): Promise<void> {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    const later: Record<string, string> = {
      dwg: 'DWG files will open in a later version. For now, ask for the drawing to be saved as DXF or PDF.',
      stl: '3D files will open in a later version.', obj: '3D files will open in a later version.',
      step: '3D files will open in a later version.', stp: '3D files will open in a later version.',
    };
    $('busy').hidden = false;
    try {
      if (ext === 'dxf') {
        this.pdf = null;
        this.load(parseDxf(await f.text(), f.name));
      } else if (ext === 'pdf') {
        const file = await openPdf(await f.arrayBuffer());
        this.pdf = { file, name: f.name, page: 1 };
        await this.showPdfPage(1);
      } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
        this.pdf = null;
        this.load(await openImage(f, f.name));
      } else {
        this.toast(later[ext] ?? 'Planbench cannot open this kind of file. Please choose a DXF, PDF or picture.');
      }
    } catch (err) {
      this.toast(err instanceof Error ? err.message : 'This file could not be opened.');
    } finally {
      $('busy').hidden = true;
    }
  }

  private async showPdfPage(n: number): Promise<void> {
    const pdf = this.pdf;
    if (!pdf || n < 1 || n > pdf.file.pageCount) return;
    $('busy').hidden = false;
    try {
      const label = pdf.file.pageCount > 1 ? `${pdf.name} (page ${n})` : pdf.name;
      const d = await pdf.file.page(n, label);
      pdf.page = n;
      this.load(d);
    } catch {
      this.toast('This page of the PDF could not be shown.');
    } finally {
      $('busy').hidden = true;
    }
  }

  private load(d: Drawing): void {
    this.drawing = d;
    this.points = [];
    this.measurements = [];
    this.lastResult = '';
    this.hover = null;
    $('welcome').hidden = true;
    const pages = this.pdf && this.pdf.file.pageCount > 1 ? this.pdf : null;
    $('pages').hidden = !pages;
    if (pages) {
      $('page-label').textContent = `Page ${pages.page} of ${pages.file.pageCount}`;
      $<HTMLButtonElement>('page-prev').disabled = pages.page <= 1;
      $<HTMLButtonElement>('page-next').disabled = pages.page >= pages.file.pageCount;
    }
    $('filename').textContent = d.name;
    this.buildLayerList();
    this.fit();
    if (d.scaled) {
      this.toast(`Opened. ${d.unitNote}`);
      if (this.tool === 'scale') this.setTool('pan');
    } else {
      // Pictures and PDFs: go straight to setting the scale, so measurements come out right.
      this.setTool('scale');
    }
    this.updateHint();
  }

  // ---------------------------------------------------------------- layers

  private buildLayerList(): void {
    const list = $('layer-list');
    list.textContent = '';
    const d = this.drawing;
    if (!d) return;
    const used = new Set(d.prims.map((p) => p.layer));
    $('layers-empty').hidden = used.size > 0;
    d.layers.forEach((layer, i) => {
      if (!used.has(i)) return;
      const li = document.createElement('li');
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = layer.visible;
      box.addEventListener('change', () => { layer.visible = box.checked; this.dirty = true; });
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = readable(layer.color, this.theme());
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = layer.name;
      label.append(box, sw, name);
      li.appendChild(label);
      list.appendChild(li);
    });
  }

  private setAllLayers(on: boolean): void {
    if (!this.drawing) return;
    for (const l of this.drawing.layers) l.visible = on;
    this.buildLayerList();
    this.dirty = true;
  }

  toggleLayers(force?: boolean): void {
    const el = $('layers');
    el.classList.toggle('open', force ?? !el.classList.contains('open'));
  }

  // ---------------------------------------------------------------- modes, tools, commands

  setMode(mode: Mode): void {
    this.mode = mode;
    this.root.dataset.mode = mode;
    try { localStorage.setItem('planbench.mode', mode); } catch { /* ignore */ }
    $('mode-simple').setAttribute('aria-pressed', String(mode === 'simple'));
    $('mode-pro').setAttribute('aria-pressed', String(mode === 'pro'));
    for (const b of BUTTONS) {
      const el = $(`tool-${b.id}`);
      el.querySelector('.label')!.textContent = mode === 'simple' ? b.simple : b.pro;
      el.title = mode === 'pro' ? `${b.pro} (${b.key})` : '';
    }
    this.buildLayerList();
    this.updateHint();
    this.dirty = true;
  }

  private runButton(b: ToolButton): void {
    this.lastCommand = b.id;
    if (b.tool) this.setTool(b.tool);
    else b.run?.(this);
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    this.points = [];
    this.hover = null;
    for (const b of BUTTONS) if (b.tool) $(`tool-${b.id}`).setAttribute('aria-pressed', String(b.tool === tool));
    this.updateCursor();
    this.updateHint();
    this.dirty = true;
  }

  private command(text: string): void {
    if (text === '') {
      if (this.points.length) this.finish();
      else if (this.lastCommand) this.command(this.lastCommand.toUpperCase());
      return;
    }
    if (text === 'HELP' || text === '?') {
      this.say('DI distance · AA area · ANG angle · P pan · Z zoom extents · LA layers · OPEN · CLEAR · Esc cancel · Enter finish/repeat');
      return;
    }
    if (text === 'SIMPLE') { this.setMode('simple'); return; }
    const id = ALIASES[text] ?? text.toLowerCase();
    const b = BUTTONS.find((x) => x.id === id);
    if (!b) { this.say(`Unknown command "${text}". Type HELP for the list.`); return; }
    this.runButton(b);
  }

  fit(): void {
    if (this.drawing) this.view.fit(this.drawing.bbox);
    this.dirty = true;
  }

  clearMeasurements(): void {
    this.measurements = [];
    this.points = [];
    this.lastResult = '';
    this.updateHint();
    this.dirty = true;
  }

  private cancel(): void {
    if (this.points.length) this.points = [];
    else if (this.tool !== 'pan') this.setTool('pan');
    this.updateHint();
    this.dirty = true;
  }

  /** Finish a measurement that takes any number of points (area). */
  private finish(): void {
    if (this.tool === 'pan' || this.tool === 'scale') return;
    // A double-click adds the same point twice; drop repeats.
    const pts = this.points.filter((p, i, all) => i === 0 || dist(p, all[i - 1]) > 1e-6);
    const m: Measurement = { kind: this.tool, pts };
    this.points = [];
    if (isComplete(m)) this.store(m);
    this.updateHint();
    this.dirty = true;
  }

  private store(m: Measurement): void {
    this.measurements.push(m);
    this.lastResult = resultSentence(m, this.mode === 'pro');
    if (this.drawing && !this.drawing.scaled) this.lastResult += '  — The scale has not been set yet, so this size is not real.';
  }

  // ---------------------------------------------------------------- setting the scale

  private askScale(a: Pt, b: Pt): void {
    if (dist(a, b) === 0) { this.points = []; this.toast('Those two points are in the same place. Please try again.'); return; }
    this.scaleLine = [a, b];
    const d = this.drawing!;
    $('scale-now').textContent = d.scaled
      ? `At the moment that line measures ${fmtLength(dist(a, b))}.`
      : 'You have marked a line on the plan.';
    $('scale-presets').hidden = !d.underlay?.paperW;
    $('scale-error').hidden = true;
    const input = $<HTMLInputElement>('scale-length');
    input.value = '';
    $<HTMLDialogElement>('scale-dialog').showModal();
    input.focus();
  }

  private applyTypedScale(): void {
    const raw = $<HTMLInputElement>('scale-length').value.trim().replace(',', '.');
    const value = Number(raw);
    const err = $('scale-error');
    if (!this.scaleLine || raw === '' || !Number.isFinite(value) || value <= 0) {
      err.textContent = 'Please type the length as a number, for example 3.6';
      err.hidden = false;
      return;
    }
    const real = value * Number($<HTMLSelectElement>('scale-unit').value);
    this.rescale(factorFromKnownLength(dist(this.scaleLine[0], this.scaleLine[1]), real));
    this.toast(`Scale set. That line is now ${fmtLength(real)}.`);
  }

  private applyPrintedScale(oneTo: number): void {
    const u = this.drawing?.underlay;
    if (!u) return;
    this.rescale(factorFromPrintedScale(u, oneTo));
    this.toast(`Scale set to 1:${oneTo}.`);
  }

  private rescale(k: number): void {
    const d = this.drawing!;
    scaleDrawing(d, k);
    for (const m of this.measurements) m.pts = m.pts.map((p) => [p[0] * k, p[1] * k] as Pt);
    // Keep the picture exactly where it is on screen.
    this.view.cx *= k;
    this.view.cy *= k;
    this.view.zoom /= k;
    this.lastResult = '';
    this.scaleLine = null;
    $<HTMLDialogElement>('scale-dialog').close();
    this.setTool('length');
  }

  private addPoint(p: Pt): void {
    if (this.tool === 'pan' || !this.drawing) return;
    this.points.push(p);
    this.lastResult = '';
    if (this.tool === 'scale') {
      if (this.points.length === 2) this.askScale(this.points[0], this.points[1]);
    } else if (this.points.length >= pointsNeeded(this.tool)) {
      this.store({ kind: this.tool, pts: this.points });
      this.points = [];
    }
    this.updateHint();
    this.dirty = true;
  }

  // ---------------------------------------------------------------- words on screen

  private say(text: string): void {
    $('hint').textContent = text;
  }

  private toast(text: string): void {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { el.hidden = true; }, 5000);
  }

  private updateHint(): void {
    const tap = this.coarse ? 'Tap' : 'Click';
    const n = this.points.length;
    let text: string;
    if (!this.drawing) text = 'Open a drawing to begin.';
    else if (this.lastResult && n === 0) text = this.lastResult;
    else if (this.tool === 'pan') text = this.coarse ? 'Drag to move around. Pinch with two fingers to zoom.' : 'Drag to move around. Scroll to zoom in and out.';
    else if (this.tool === 'scale') text = n === 0
      ? `To set the scale, find something whose real length you know, such as a wall with its size written on it. ${tap} one end of it.`
      : `Now ${tap.toLowerCase()} the other end.`;
    else if (this.tool === 'length') text = n === 0 ? `${tap} the first point.` : `Now ${tap.toLowerCase()} the second point.`;
    else if (this.tool === 'angle') text = [`${tap} a point on the first line.`, `Now ${tap.toLowerCase()} the corner.`, `Now ${tap.toLowerCase()} a point on the second line.`][n];
    else text = n < 3 ? `${tap} each corner of the area in turn. (${n} so far)` : `Keep going round the corners, then press Done. (${n} so far)`;
    this.say(text);
    $('done').hidden = !(this.tool === 'area' && n >= 3);
  }

  private updateCursor(): void {
    this.canvas.style.cursor = this.tool === 'pan' ? 'grab' : 'crosshair';
  }

  // ---------------------------------------------------------------- pointer, touch and pencil

  private local(e: PointerEvent | WheelEvent): Pt {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private updateHover(sx: number, sy: number, touch: boolean): void {
    const pt = this.view.toWorld(sx, sy);
    let snap: Snap | null = null;
    if (this.drawing && this.tool !== 'pan') {
      const tol = (touch ? 22 : 12) / this.view.zoom;
      snap = findSnap(this.drawing, pt[0], pt[1], tol, this.snaps);
      // Also snap to points already picked, so an area can be closed neatly.
      for (const p of this.points) {
        if (dist(p, pt) < tol && (!snap || snap.kind === 'near')) snap = { x: p[0], y: p[1], kind: 'end' };
      }
    }
    this.hover = { pt: snap ? [snap.x, snap.y] : pt, sx, sy, snap, touch };
    $('coords').textContent = `X ${this.hover.pt[0].toFixed(1)}  Y ${this.hover.pt[1].toFixed(1)}`;
    this.dirty = true;
  }

  private bindPointer(): void {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      const [x, y] = this.local(e);
      this.pointers.set(e.pointerId, { x, y, type: e.pointerType });
      const touches = [...this.pointers.values()].filter((p) => p.type === 'touch');
      if (touches.length >= 2) {
        // Two fingers always move and zoom the drawing, whatever tool is chosen.
        this.picking = false;
        this.panning = false;
        this.gestureLock = true;
        this.hover = null;
        const [a, b] = touches;
        this.gesture = { d: Math.hypot(b.x - a.x, b.y - a.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        this.dirty = true;
        return;
      }
      if (this.gestureLock) return;
      if (e.pointerType === 'mouse') {
        if (e.button === 2) { this.finish(); return; }
        if (e.button === 1 || this.spaceHeld || this.tool === 'pan') {
          this.panning = true;
          c.style.cursor = 'grabbing';
          return;
        }
        if (e.button === 0) {
          this.updateHover(x, y, false);
          this.addPoint(this.hover!.pt);
        }
      } else if (this.tool === 'pan') {
        this.panning = true;
      } else {
        // Finger or pencil: aim with the magnifier, the point is placed when you lift off.
        this.picking = true;
        this.updateHover(x, y, true);
      }
    });

    c.addEventListener('pointermove', (e) => {
      const [x, y] = this.local(e);
      const prev = this.pointers.get(e.pointerId);
      if (prev) this.pointers.set(e.pointerId, { x, y, type: e.pointerType });
      if (this.gesture) {
        const t = [...this.pointers.values()].filter((p) => p.type === 'touch');
        if (t.length >= 2) {
          const d = Math.hypot(t[1].x - t[0].x, t[1].y - t[0].y);
          const mx = (t[0].x + t[1].x) / 2;
          const my = (t[0].y + t[1].y) / 2;
          this.view.panBy(mx - this.gesture.mx, my - this.gesture.my);
          if (this.gesture.d > 0 && d > 0) this.view.zoomAt(mx, my, d / this.gesture.d);
          this.gesture = { d, mx, my };
          this.dirty = true;
        }
        return;
      }
      if (this.panning && prev) {
        this.view.panBy(x - prev.x, y - prev.y);
        this.dirty = true;
        return;
      }
      if (e.pointerType === 'mouse') this.updateHover(x, y, false);
      else if (this.picking) this.updateHover(x, y, true);
    });

    const up = (e: PointerEvent) => {
      const had = this.pointers.delete(e.pointerId);
      if (!had) return;
      if (this.gesture) {
        this.gesture = null;
      } else if (this.picking && e.type === 'pointerup' && this.hover) {
        this.addPoint(this.hover.pt);
      }
      this.picking = false;
      this.panning = false;
      if (e.pointerType !== 'mouse') this.hover = null;
      if (this.pointers.size === 0) this.gestureLock = false;
      this.updateCursor();
      this.dirty = true;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.panning) { this.hover = null; this.dirty = true; }
    });

    c.addEventListener('dblclick', () => { if (this.tool === 'area') this.finish(); });

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [x, y] = this.local(e);
      const step = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      this.view.zoomAt(x, y, Math.exp(-step * (e.ctrlKey ? 0.01 : 0.0015)));
      this.updateHover(x, y, false);
    }, { passive: false });
  }

  // ---------------------------------------------------------------- drawing the screen

  private resize(): void {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const first = this.view.w === 100 && this.view.h === 100;
    this.view.w = Math.max(1, r.width);
    this.view.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.view.w * dpr);
    this.canvas.height = Math.round(this.view.h * dpr);
    if (first && this.drawing) this.fit();
    this.dirty = true;
  }

  private theme(): Theme {
    return this.mode === 'pro' ? DARK : PAPER;
  }

  private render(): void {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const theme = this.theme();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, this.view.w, this.view.h);
    if (!this.drawing) return;
    drawDrawing(ctx, this.drawing, this.view, theme);
    this.drawMeasurements(ctx, this.view, theme);
    if (this.hover?.snap) this.drawSnap(ctx, this.view, this.hover.snap, theme, true);
    if (this.hover?.touch && this.picking) this.drawLoupe(ctx, theme);
  }

  private label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
    const size = this.mode === 'simple' ? 17 : 12;
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width + size;
    const h = size * 1.7;
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5);
  }

  private drawMeasurements(ctx: CanvasRenderingContext2D, v: Viewport, theme: Theme): void {
    const pro = this.mode === 'pro';
    const stroke = (pts: Pt[], closed: boolean, fill: boolean) => {
      if (!pts.length) return;
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [x, y] = v.toScreen(p[0], p[1]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      if (closed) ctx.closePath();
      if (fill) { ctx.fillStyle = 'rgba(232,89,12,0.15)'; ctx.fill(); }
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      for (const p of pts) {
        const [x, y] = v.toScreen(p[0], p[1]);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = theme.background;
        ctx.fill();
        ctx.stroke();
      }
    };
    const centre = (pts: Pt[]): Pt => {
      const s = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1]] as Pt, [0, 0] as Pt);
      return v.toScreen(s[0] / pts.length, s[1] / pts.length);
    };

    for (const m of this.measurements) {
      stroke(m.pts, m.kind === 'area', m.kind === 'area');
      const at = m.kind === 'angle' ? v.toScreen(m.pts[1][0], m.pts[1][1]) : centre(m.pts);
      this.label(ctx, resultText(m, pro), at[0], at[1] - (m.kind === 'angle' ? 24 : 0));
    }

    // The measurement being made right now, with a line following the pointer.
    if (this.tool !== 'pan' && this.points.length) {
      const live = this.hover && !this.scaleLine ? [...this.points, this.hover.pt] : this.points;
      stroke(live, this.tool === 'area' && live.length > 2, this.tool === 'area');
      if (this.hover && this.tool !== 'angle' && this.tool !== 'scale') {
        const a = live[live.length - 2];
        const b = live[live.length - 1];
        const [mx, my] = v.toScreen((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        if (dist(a, b) * v.zoom > 30) this.label(ctx, fmtLength(dist(a, b), pro), mx, my - 18);
      }
    }
  }

  private drawSnap(ctx: CanvasRenderingContext2D, v: Viewport, s: Snap, theme: Theme, withName: boolean): void {
    const [x, y] = v.toScreen(s.x, s.y);
    const r = 8;
    ctx.strokeStyle = theme.dark ? '#51cf66' : '#2b8a3e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (s.kind === 'end') ctx.rect(x - r, y - r, r * 2, r * 2);
    else if (s.kind === 'mid') { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r); ctx.lineTo(x - r, y + r); ctx.closePath(); }
    else if (s.kind === 'cen') ctx.arc(x, y, r, 0, Math.PI * 2);
    else if (s.kind === 'int') { ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); }
    else { ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.lineTo(x + r, y + r); ctx.closePath(); }
    ctx.stroke();
    if (withName && this.mode === 'simple' && !this.picking) {
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(SNAP_NAMES[s.kind], x + 14, y - 14);
    }
  }

  /** A magnifying glass shown above the fingertip, so you can see what your finger is covering. */
  private drawLoupe(ctx: CanvasRenderingContext2D, theme: Theme): void {
    const h = this.hover!;
    const R = 70;
    let lx = h.sx;
    let ly = h.sy - 120;
    if (ly - R < 8) { ly = h.sy; lx = h.sx > this.view.w / 2 ? h.sx - 150 : h.sx + 150; }
    lx = Math.max(R + 8, Math.min(this.view.w - R - 8, lx));

    const v = this.view.clone();
    v.w = R * 2;
    v.h = R * 2;
    v.cx = h.pt[0];
    v.cy = h.pt[1];
    v.zoom = this.view.zoom * 2.5;

    ctx.save();
    ctx.beginPath();
    ctx.arc(lx, ly, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = theme.background;
    ctx.fillRect(lx - R, ly - R, R * 2, R * 2);
    ctx.translate(lx - R, ly - R);
    drawDrawing(ctx, this.drawing!, v, theme);
    this.drawMeasurements(ctx, v, theme);
    if (h.snap) this.drawSnap(ctx, v, h.snap, theme, false);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(R - 14, R); ctx.lineTo(R + 14, R);
    ctx.moveTo(R, R - 14); ctx.lineTo(R, R + 14);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(lx, ly, R, 0, Math.PI * 2);
    ctx.strokeStyle = theme.dark ? '#aab4c0' : '#39424d';
    ctx.lineWidth = 3;
    ctx.stroke();
    if (h.snap) this.label(ctx, SNAP_NAMES[h.snap.kind], lx, ly + R + 18);
  }
}
