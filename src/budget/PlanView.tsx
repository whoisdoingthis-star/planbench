import { useRef, useState } from 'preact/hooks';
import { newId } from './model';
import { type Furniture, type ItemKind, type Layout, ITEM_NAMES, wallWidth } from './layout';
import { NumberBox } from './ui';

const FLOORS = { tile: '#dfe3e6', carpet: '#d8cfbf', deck: '#e4e7ea', plain: '#ececea' };
const SNAP = 50;
/** Is this colour pale enough to need dark writing on it? */
const light = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) > 150;
};

/** The room seen from above. Furniture can be dragged about. */
export function PlanView({ layout: l, changed }: { layout: Layout; changed: () => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; x: number; y: number } | null>(null);

  const minX = Math.min(...l.zones.map((z) => z.x)) - 300;
  const minY = Math.min(...l.zones.map((z) => z.y)) - 300;
  const maxX = Math.max(...l.zones.map((z) => z.x + z.w)) + 300;
  const maxY = Math.max(...l.zones.map((z) => z.y + z.d)) + 300;

  const point = (e: PointerEvent): [number, number] => {
    const m = svg.current!.getScreenCTM()!.inverse();
    return [m.a * e.clientX + m.c * e.clientY + m.e, m.b * e.clientX + m.d * e.clientY + m.f];
  };
  const start = (e: PointerEvent, it: Furniture) => {
    e.preventDefault();
    svg.current!.setPointerCapture(e.pointerId);
    const [px, py] = point(e);
    setSelected(it.id);
    setDrag({ id: it.id, dx: it.x - px, dy: it.y - py, x: it.x, y: it.y });
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    const [px, py] = point(e);
    setDrag({ ...drag, x: Math.round((px + drag.dx) / SNAP) * SNAP, y: Math.round((py + drag.dy) / SNAP) * SNAP });
  };
  const end = () => {
    if (!drag) return;
    const it = l.items.find((i) => i.id === drag.id);
    if (it && (it.x !== drag.x || it.y !== drag.y)) { it.x = drag.x; it.y = drag.y; changed(); }
    setDrag(null);
  };

  const add = (kind: ItemKind) => {
    const sizes: Record<ItemKind, [number, number, number, string]> = {
      table: [1800, 900, 750, '#9a6a3c'], rug: [2400, 1600, 12, '#b9a58c'], sofa: [2000, 900, 850, '#4a4d52'], box: [800, 500, 900, '#c9c4ba'],
    };
    const [w, d, h, color] = sizes[kind];
    const z = l.zones[0];
    const it: Furniture = { id: newId(), name: ITEM_NAMES[kind], kind, x: z.x + z.w / 2, y: z.y + z.d / 2, w, d, h, rot: 0, color, chairs: kind === 'table' ? 6 : 0, lift: 0 };
    l.items.push(it);
    setSelected(it.id);
    changed();
  };

  const sel = l.items.find((i) => i.id === selected) ?? null;
  // Rugs first so that tables are drawn (and picked up) on top of them.
  const ordered = [...l.items].sort((a, b) => Number(b.kind === 'rug') - Number(a.kind === 'rug'));

  return (
    <div>
      <svg ref={svg} class="planview" viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} onPointerMove={move} onPointerUp={end} onPointerCancel={end} role="img" aria-label="The room seen from above">
        {l.zones.map((z) => (
          <g key={z.id}>
            <rect x={z.x} y={z.y} width={z.w} height={z.d} fill={FLOORS[z.floor]} stroke="#b4bbc2" stroke-width="12" />
            <text x={z.x + 110} y={z.y + 230} font-size="150" fill="#5b6672">{z.name}</text>
            <text x={z.x + 110} y={z.y + 410} font-size="120" fill="#7a848f">{(z.w / 1000).toFixed(2)} × {(z.d / 1000).toFixed(2)} m</text>
          </g>
        ))}
        {l.walls.map((w) => {
          // Each kitchen run as a strip 600 mm deep, coming out from its wall.
          const len = wallWidth(w);
          return (
            <g key={w.id} transform={`translate(${w.x} ${w.y}) rotate(${w.dir})`}>
              {(() => {
                let a = 0;
                return w.base.map((s) => {
                  const x = a;
                  a += s.w;
                  if (s.kind === 'gap') return null;
                  const deep = s.kind === 'fridge' ? l.fridgeD || 690 : 600;
                  return <rect key={s.id} x={x} y={0} width={s.w} height={deep} fill={s.kind === 'fridge' || s.kind === 'dishwasher' ? '#aeb4ba' : s.kind === 'oven' ? '#4a4d52' : '#ffffff'} stroke="#3d4650" stroke-width="10" />;
                });
              })()}
              <line x1={0} y1={0} x2={len} y2={0} stroke="#3d4650" stroke-width="30" />
            </g>
          );
        })}
        {l.roomWalls.map((w) => {
          const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
          const ang = (Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180) / Math.PI;
          return (
            <g key={w.id} transform={`translate(${w.x1} ${w.y1}) rotate(${ang})`}>
              <line x1={0} y1={0} x2={len} y2={0} stroke="#3d4650" stroke-width="70" />
              {w.openings.map((o, i) => <line key={i} x1={o.from} y1={0} x2={o.from + o.w} y2={0} stroke={o.kind === 'door' ? '#ffffff' : '#8fc7e6'} stroke-width="52" />)}
            </g>
          );
        })}
        {ordered.map((it) => {
          const x = drag?.id === it.id ? drag.x : it.x;
          const y = drag?.id === it.id ? drag.y : it.y;
          return (
            <g key={it.id} transform={`translate(${x} ${y}) rotate(${it.rot})`} class="plan-item" onPointerDown={(e) => start(e, it)}>
              <rect x={-it.w / 2} y={-it.d / 2} width={it.w} height={it.d} rx="30" fill={it.color} fill-opacity={it.kind === 'rug' ? 0.55 : 0.9} stroke={selected === it.id ? '#c2410c' : '#3d4650'} stroke-width={selected === it.id ? 40 : 14} />
              <text x={0} y={45} font-size="130" text-anchor="middle" fill={it.kind === 'rug' || light(it.color) ? '#3d4650' : '#ffffff'}>{it.name}</text>
            </g>
          );
        })}
      </svg>
      <p class="muted">Drag a piece of furniture to move it. Tap one to change its size or turn it.</p>
      {sel && (
        <div class="fields plan-editor">
          <label class="grow">Name
            <input value={sel.name} onInput={(e) => { sel.name = e.currentTarget.value; changed(); }} />
          </label>
          <label>Length<NumberBox key={`${sel.id}w`} label="Length" value={sel.w} onValue={(v) => { sel.w = v; changed(); }} /></label>
          <label>Width<NumberBox key={`${sel.id}d`} label="Width" value={sel.d} onValue={(v) => { sel.d = v; changed(); }} /></label>
          <label>Height<NumberBox key={`${sel.id}h`} label="Height" value={sel.h} onValue={(v) => { sel.h = v; changed(); }} /></label>
          {sel.kind === 'box' && <label>Height off the floor<NumberBox key={`${sel.id}l`} label="Height off the floor" value={sel.lift} onValue={(v) => { sel.lift = v; changed(); }} /></label>}
          {sel.kind === 'table' && <label>Chairs<NumberBox key={`${sel.id}c`} label="Chairs" value={sel.chairs} onValue={(v) => { sel.chairs = Math.min(12, Math.round(v)); changed(); }} /></label>}
          <label>Colour
            <span class="swatch-row"><input type="color" aria-label="Colour" value={sel.color} onInput={(e) => { sel.color = e.currentTarget.value; changed(); }} /></span>
          </label>
          <div class="row-actions" style="margin-top:22px">
            <button type="button" class="btn small" onClick={() => { sel.rot = (sel.rot + 90) % 180; changed(); }}>Turn it</button>
            <button type="button" class="btn small danger" onClick={() => { if (confirm(`Remove “${sel.name}”?`)) { l.items = l.items.filter((i) => i.id !== sel.id); setSelected(null); changed(); } }}>Remove</button>
          </div>
        </div>
      )}
      <div class="row-actions">
        <span class="muted" style="margin:0">Add:</span>
        {(Object.keys(ITEM_NAMES) as ItemKind[]).map((k) => <button key={k} type="button" class="btn small" onClick={() => add(k)}>{ITEM_NAMES[k]}</button>)}
      </div>
    </div>
  );
}
