import { useState } from 'preact/hooks';
import type { Project } from './model';
import { newId } from './model';
import {
  type HeightOption, type Layout, type SegKind, type Segment, type Wall,
  KIND_NAMES, benchTop, defaultLayout, optionFacts, seg, wallWidth,
} from './layout';
import { NumberBox } from './ui';
import { Kitchen3D } from './Kitchen3D';
import { PlanView } from './PlanView';

interface Props {
  project: Project;
  changed: () => void;
}

export function LayoutView({ project: p, changed }: Props) {
  const [wallId, setWallId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const l = p.layout;
  if (!l) {
    return (
      <div class="budget">
        <section class="card">
          <h2>See a wall, drawn to scale</h2>
          <p class="muted">Lay out the units along a wall, then compare choices such as how tall the splashback is and how high the wall cabinets sit.</p>
          <button type="button" class="btn primary" onClick={() => { p.layout = defaultLayout(); changed(); }}>Start a wall view</button>
        </section>
      </div>
    );
  }
  const wall = l.walls.find((w) => w.id === wallId) ?? l.walls[0];

  const shown = l.options.find((o) => o.id === viewId) ?? l.options.find((o) => o.id === l.chosen) ?? l.options[0];

  return (
    <div class="budget layout">
      {shown && (
        <section class="card">
          <div class="row-actions" style="margin-top:0">
            <h2 style="margin:0">{l.zones.length ? 'The room in 3D' : 'The kitchen in 3D'}</h2>
            {l.options.length > 1 && l.options.map((o) => (
              <button key={o.id} type="button" class={`btn small ${o === shown ? 'primary' : ''}`} onClick={() => setViewId(o.id)}>{o.name}</button>
            ))}
          </div>
          <Kitchen3D project={p} layout={l} option={shown} />
          <div class="fields">
            <label>Wall tile shade
              <span class="swatch-row">
                <input type="color" aria-label="Wall tile shade" value={l.splashTint} onInput={(e) => { l.splashTint = e.currentTarget.value; changed(); }} />
              </span>
            </label>
            <label class="grow">How strongly to shade the wall tiles
              <input type="range" min="0" max="80" step="5" aria-label="How strongly to shade the wall tiles" value={l.splashTintPct} onInput={(e) => { l.splashTintPct = Number(e.currentTarget.value); changed(); }} />
            </label>
          </div>
          <p class="muted">Photos rarely match a tile exactly. Use these to nudge the wall tiles lighter, warmer or cooler until they look like the real thing.</p>
        </section>
      )}
      {l.zones.length > 0 && (
        <section class="card">
          <h2>The room from above</h2>
          <PlanView layout={l} changed={changed} />
        </section>
      )}
      <section class="card">
        <div class="row-actions" style="margin-top:0">
          <h2 style="margin:0">Wall</h2>
          {l.walls.map((w) => (
            <button key={w.id} type="button" class={`btn small ${w === wall ? 'primary' : ''}`} onClick={() => setWallId(w.id)}>{w.name || 'Wall'}</button>
          ))}
          <button type="button" class="btn small" onClick={() => { const w: Wall = { id: newId(), name: 'New wall', base: [seg('cabinet', 600)], upper: [seg('cabinet', 600)], hobW: 0, x: 0, y: 0, dir: 0 }; l.walls.push(w); setWallId(w.id); changed(); }}>Add a wall</button>
        </div>
        <div class="fields">
          <Num label="Ceiling height" value={l.ceiling} set={(v) => { l.ceiling = v; }} changed={changed} />
          <Num label="Toe kick" value={l.toeKick} set={(v) => { l.toeKick = v; }} changed={changed} />
          <Num label="Base cabinet height" value={l.baseH} set={(v) => { l.baseH = v; }} changed={changed} />
          <Num label="Benchtop thickness" value={l.benchT} set={(v) => { l.benchT = v; }} changed={changed} />
          <Num label="Pantry height" value={l.tallH} set={(v) => { l.tallH = v; }} changed={changed} />
          <Num label="Splashback tile width" value={l.tileW} set={(v) => { l.tileW = v; }} changed={changed} />
          <Num label="Splashback tile height" value={l.tileH} set={(v) => { l.tileH = v; }} changed={changed} />
          <Num label="Floor tile length" value={l.floorTileW} set={(v) => { l.floorTileW = v; }} changed={changed} />
          <Num label="Floor tile width" value={l.floorTileH} set={(v) => { l.floorTileH = v; }} changed={changed} />
        </div>
        <p class="muted">All sizes are in millimetres. Bench top is {benchTop(l)} mm from the floor.</p>
        {wall && <WallEditor l={l} wall={wall} changed={changed} removed={() => setWallId(null)} />}
      </section>

      {wall && (
        <div class="option-grid">
          {l.options.map((o) => <OptionCard key={o.id} l={l} wall={wall} o={o} changed={changed} />)}
        </div>
      )}
      <div class="row-actions">
        <button type="button" class="btn" onClick={() => { const last = l.options[l.options.length - 1]; l.options.push({ id: newId(), name: 'New option', splash: last?.splash ?? 600, upperH: last?.upperH ?? 720 }); changed(); }}>Add an option to compare</button>
      </div>
    </div>
  );
}

function Num({ label, value, set, changed }: { label: string; value: number; set: (v: number) => void; changed: () => void }) {
  return (
    <label>{label}
      <NumberBox label={label} value={value} onValue={(v) => { set(v); changed(); }} />
    </label>
  );
}

function WallEditor({ l, wall, changed, removed }: { l: Layout; wall: Wall; changed: () => void; removed: () => void }) {
  const rows = (title: string, list: Segment[], kinds: SegKind[]) => (
    <div class="seg-list">
      <h3>{title} <span class="muted">({list.reduce((n, s) => n + s.w, 0)} mm in all)</span></h3>
      {list.map((s, i) => (
        <div class="seg-row" key={s.id}>
          <select aria-label="Kind of unit" value={s.kind} onChange={(e) => { s.kind = e.currentTarget.value as SegKind; changed(); }}>
            {kinds.map((k) => <option key={k} value={k}>{KIND_NAMES[k]}</option>)}
          </select>
          <NumberBox label="Width in millimetres" value={s.w} onValue={(v) => { s.w = v; changed(); }} />
          <button type="button" class="btn small" aria-label="Move left" disabled={i === 0} onClick={() => { list.splice(i - 1, 0, list.splice(i, 1)[0]); changed(); }}>←</button>
          <button type="button" class="btn small" aria-label="Move right" disabled={i === list.length - 1} onClick={() => { list.splice(i + 1, 0, list.splice(i, 1)[0]); changed(); }}>→</button>
          <button type="button" class="btn small danger" onClick={() => { list.splice(i, 1); changed(); }}>Remove</button>
        </div>
      ))}
      <button type="button" class="btn small" onClick={() => { list.push(seg('cabinet', 600)); changed(); }}>Add a unit</button>
    </div>
  );
  return (
    <details class="settings">
      <summary>Change the units along this wall</summary>
      <div class="fields">
        <label class="grow">Name of this wall
          <input value={wall.name} onInput={(e) => { wall.name = e.currentTarget.value; changed(); }} />
        </label>
        <label>Cooktop width (0 for none)
          <NumberBox label="Cooktop width" value={wall.hobW} onValue={(v) => { wall.hobW = v; changed(); }} />
        </label>
      </div>
      <p class="muted">List the units from left to right as you face the wall.</p>
      {rows('On the floor', wall.base, ['cabinet', 'drawers', 'sink', 'oven', 'dishwasher', 'fridge', 'tall', 'filler', 'gap'])}
      {rows('On the wall', wall.upper, ['cabinet', 'hood', 'open', 'filler', 'gap'])}
      {l.walls.length > 1 && (
        <div class="row-actions">
          <button type="button" class="btn small danger" onClick={() => { if (confirm(`Delete the wall “${wall.name}”?`)) { l.walls = l.walls.filter((w) => w.id !== wall.id); removed(); changed(); } }}>Delete this wall</button>
        </div>
      )}
    </details>
  );
}

function OptionCard({ l, wall, o, changed }: { l: Layout; wall: Wall; o: HeightOption; changed: () => void }) {
  const f = optionFacts(l, o);
  const picked = l.chosen === o.id;
  return (
    <section class={`card option-card ${picked ? 'picked' : ''}`}>
      <input class="section-name" aria-label="Name of this option" value={o.name} onInput={(e) => { o.name = e.currentTarget.value; changed(); }} />
      <div class="fields">
        <Num label="Splashback height" value={o.splash} set={(v) => { o.splash = v; }} changed={changed} />
        <Num label="Wall cabinet height" value={o.upperH} set={(v) => { o.upperH = v; }} changed={changed} />
      </div>
      <Elevation l={l} wall={wall} o={o} />
      <ul class="facts">
        {f.notes.map((n, i) => <li key={i} class={n.tone}>{n.text}</li>)}
      </ul>
      <div class="row-actions">
        {l.options.length > 1 && <button type="button" class="btn small danger" onClick={() => { if (confirm(`Delete the option “${o.name}”?`)) { l.options = l.options.filter((x) => x.id !== o.id); if (picked) l.chosen = null; changed(); } }}>Delete</button>}
        <span class="spacer" />
        <button type="button" class={`btn ${picked ? 'primary' : ''}`} aria-pressed={picked} onClick={() => { l.chosen = picked ? null : o.id; changed(); }}>{picked ? '✓ Our choice' : 'Choose this'}</button>
      </div>
    </section>
  );
}

/** The wall drawn to scale, in millimetres. */
function Elevation({ l, wall, o }: { l: Layout; wall: Wall; o: HeightOption }) {
  const f = optionFacts(l, o);
  const W = wallWidth(wall) || 1000;
  const H = Math.max(l.ceiling, f.top);
  const bench = benchTop(l);
  const y = (mm: number) => H - mm; // the drawing's zero is at the top
  const pad = { l: 40, r: 820, t: 150, b: 150 };
  const line = '#3d4650';
  const parts: preact.JSX.Element[] = [];
  let k = 0;
  const rect = (x: number, from: number, to: number, w: number, fill: string, extra: Record<string, string | number> = {}) =>
    parts.push(<rect key={k++} x={x} y={y(to)} width={Math.max(0, w)} height={Math.max(0, to - from)} fill={fill} stroke={line} stroke-width="5" {...extra} />);
  const seam = (x1: number, y1: number, x2: number, y2: number) =>
    parts.push(<line key={k++} x1={x1} y1={y(y1)} x2={x2} y2={y(y2)} stroke={line} stroke-width="4" />);
  const width = (x: number, w: number, at: number) =>
    w >= 140 && parts.push(<text key={k++} x={x + w / 2} y={y(at)} font-size="62" text-anchor="middle" fill="#5b6672">{Math.round(w)}</text>);

  // Splashback tiles, laid from the bench upwards and from the left.
  const tiles: preact.JSX.Element[] = [];
  if (o.splash > 0) {
    tiles.push(<rect key="bg" x={0} y={y(f.underside)} width={W} height={o.splash} fill="#dfeaf0" />);
    if (f.cutRow > 0) tiles.push(<rect key="cut" x={0} y={y(f.underside)} width={W} height={f.cutRow} fill="#f6c9a5" />);
    if (l.tileH >= 20) for (let h = bench + l.tileH; h < f.underside - 0.5; h += l.tileH) tiles.push(<line key={`h${h}`} x1={0} y1={y(h)} x2={W} y2={y(h)} stroke="#8fa5b3" stroke-width="4" />);
    if (l.tileW >= 20) for (let x = l.tileW; x < W - 0.5; x += l.tileW) tiles.push(<line key={`v${x}`} x1={x} y1={y(bench)} x2={x} y2={y(f.underside)} stroke="#8fa5b3" stroke-width="4" />);
  }

  // Units on the floor.
  let x = 0;
  let ovenAt: number | null = null;
  for (const s of wall.base) {
    const lo = l.toeKick;
    const hi = l.toeKick + l.baseH;
    if (s.kind === 'tall') {
      rect(x, lo, l.tallH, s.w, '#ffffff');
      rect(x, 0, lo, s.w, '#b9c0c7');
      if (s.w > 500) seam(x + s.w / 2, lo, x + s.w / 2, l.tallH);
      seam(x, bench, x + s.w, bench);
    } else if (s.kind === 'fridge') {
      const fw = l.fridgeW > 0 ? Math.min(l.fridgeW, s.w) : s.w - 20;
      const fh = l.fridgeH || 1790;
      rect(x + (s.w - fw) / 2, 0, fh, fw, '#aab1b8');
      seam(x + (s.w - fw) / 2, fh * 0.36, x + (s.w + fw) / 2, fh * 0.36);
    } else if (s.kind !== 'gap') {
      rect(x, 0, lo, s.w, '#b9c0c7');
      rect(x, hi, bench, s.w, '#e9e2d3');
      if (s.kind === 'oven') {
        rect(x, lo, hi, s.w, '#ffffff');
        rect(x + 20, lo + 70, hi - 20, s.w - 40, '#22262b');
        ovenAt = x + s.w / 2;
      } else if (s.kind === 'dishwasher') {
        rect(x, 0, hi, s.w, '#c3c9ce');
        seam(x, hi - 110, x + s.w, hi - 110);
      } else {
        rect(x, lo, hi, s.w, s.kind === 'filler' ? '#f1f1ee' : '#ffffff');
        if (s.kind === 'drawers') { seam(x, lo + l.baseH * 0.42, x + s.w, lo + l.baseH * 0.42); seam(x, lo + l.baseH * 0.76, x + s.w, lo + l.baseH * 0.76); }
        else if ((s.kind === 'cabinet' || s.kind === 'sink') && s.w > 500) seam(x + s.w / 2, lo, x + s.w / 2, hi);
      }
    }
    width(x, s.w, -90);
    x += s.w;
  }
  if (ovenAt !== null && wall.hobW > 0) rect(ovenAt - wall.hobW / 2, bench, bench + 14, wall.hobW, '#15181c');

  // Units on the wall.
  x = 0;
  for (const s of wall.upper) {
    if (s.kind !== 'gap') {
      const u0 = s.lo ?? f.underside;
      const u1 = s.hi ?? f.top;
      rect(x, u0, u1, s.w, s.kind === 'filler' ? '#f1f1ee' : s.kind === 'open' ? '#f7f3ea' : '#ffffff');
      if (s.kind === 'open' && u1 - u0 > 500) seam(x, (u0 + u1) / 2, x + s.w, (u0 + u1) / 2);
      else if ((s.kind === 'cabinet' || s.kind === 'hood') && s.w > 500) seam(x + s.w / 2, u0, x + s.w / 2, u1);
      if (s.kind === 'hood') rect(x + 30, u0 - 18, u0, s.w - 60, '#8a9199');
      width(x, s.w, (u0 + u1) / 2 - 20);
    }
    x += s.w;
  }

  // Measurements down the right-hand side.
  const stops = [0, bench, f.underside, f.top, Math.max(l.ceiling, f.top)];
  const names = ['to bench top', 'splashback', 'wall cabinets', 'to ceiling'];
  const dims: preact.JSX.Element[] = [];
  const dx = W + 70;
  stops.forEach((s, i) => dims.push(<line key={`t${i}`} x1={dx - 25} y1={y(s)} x2={dx + 25} y2={y(s)} stroke="#c2410c" stroke-width="6" />));
  for (let i = 0; i < 4; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    const size = i === 3 ? f.toCeiling : b - a;
    dims.push(<line key={`l${i}`} x1={dx} y1={y(a)} x2={dx} y2={y(b)} stroke="#c2410c" stroke-width="6" />);
    const mid = Math.abs(b - a) < 150 ? y(b) - 40 : y((a + b) / 2);
    dims.push(
      <text key={`n${i}`} x={dx + 45} y={mid} font-size="78" font-weight="700" fill={i === 1 ? '#c2410c' : '#1b1f24'} dominant-baseline="middle">
        {Math.round(size)}<tspan font-size="50" font-weight="400" fill="#5b6672"> {names[i]}</tspan>
      </text>,
    );
  }

  return (
    <svg class="elevation" viewBox={`${-pad.l} ${-pad.t} ${W + pad.l + pad.r} ${H + pad.t + pad.b}`} role="img" aria-label={`${wall.name}: splashback ${o.splash} mm, wall cabinets ${o.upperH} mm`}>
      <rect x={0} y={y(l.ceiling)} width={W} height={l.ceiling} fill="#f7f5f0" stroke={line} stroke-width="6" />
      {tiles}
      {parts}
      <line x1={0} y1={y(l.tallH)} x2={W + 30} y2={y(l.tallH)} stroke="#2b6cb0" stroke-width="6" stroke-dasharray="26 18" />
      <text x={W - 12} y={y(l.tallH) - 16} font-size="54" font-weight="700" text-anchor="end" fill="#2b6cb0" stroke="#ffffff" stroke-width="14" paint-order="stroke">pantry top {l.tallH}</text>
      <line x1={-pad.l} y1={y(0)} x2={W + 30} y2={y(0)} stroke={line} stroke-width="10" />
      {dims}
    </svg>
  );
}
