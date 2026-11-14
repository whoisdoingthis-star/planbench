// A wall seen straight on (an "elevation"): base units along the floor, wall cabinets above,
// and a few height options to compare, such as how tall the splashback is.
import { newId } from './model';

export type SegKind = 'cabinet' | 'drawers' | 'oven' | 'dishwasher' | 'fridge' | 'tall' | 'hood' | 'open' | 'filler' | 'gap';

export const KIND_NAMES: Record<SegKind, string> = {
  cabinet: 'Cupboard', drawers: 'Drawers', oven: 'Oven', dishwasher: 'Dishwasher', fridge: 'Fridge',
  tall: 'Tall unit / pantry', hood: 'Rangehood cabinet', open: 'Open shelf', filler: 'Filler panel', gap: 'Empty space',
};

export interface Segment {
  id: string;
  kind: SegKind;
  /** Width in millimetres. */
  w: number;
  label: string;
}

export interface Wall {
  id: string;
  name: string;
  /** Units standing on the floor, left to right. */
  base: Segment[];
  /** Units hung on the wall, left to right. */
  upper: Segment[];
  /** Width of the cooktop, drawn centred over the oven. 0 for none. */
  hobW: number;
}

export interface HeightOption {
  id: string;
  name: string;
  /** Bench top to the underside of the wall cabinets (the splashback height). */
  splash: number;
  /** Height of the wall cabinets. */
  upperH: number;
}

export interface Layout {
  ceiling: number;
  toeKick: number;
  baseH: number;
  benchT: number;
  /** Height of tall units such as the pantry, from the floor. */
  tallH: number;
  tileW: number;
  tileH: number;
  walls: Wall[];
  options: HeightOption[];
  chosen: string | null;
}

export const seg = (kind: SegKind, w: number, label = ''): Segment => ({ id: newId(), kind, w, label });

export function defaultLayout(): Layout {
  return {
    ceiling: 2400, toeKick: 150, baseH: 720, benchT: 30, tallH: 2086, tileW: 600, tileH: 300,
    walls: [{
      id: newId(), name: 'Cooktop wall', hobW: 600,
      base: [seg('cabinet', 600), seg('drawers', 600), seg('oven', 600), seg('cabinet', 600), seg('cabinet', 600)],
      upper: [seg('cabinet', 600), seg('cabinet', 600), seg('hood', 600), seg('cabinet', 600), seg('cabinet', 600)],
    }],
    options: [{ id: newId(), name: 'Standard', splash: 600, upperH: 720 }],
    chosen: null,
  };
}

export const benchTop = (l: Layout): number => l.toeKick + l.baseH + l.benchT;
export const wallWidth = (w: Wall): number => Math.max(sum(w.base), sum(w.upper));
const sum = (s: Segment[]) => s.reduce((n, x) => n + (x.w || 0), 0);

export interface OptionFacts {
  underside: number;
  top: number;
  /** Space between the top of the wall cabinets and the ceiling. Negative means it does not fit. */
  toCeiling: number;
  /** How far the wall cabinet tops sit above (+) or below (-) the tall units. */
  vsTall: number;
  fullRows: number;
  /** Height of the cut row of tiles at the top, or 0 when whole tiles fit exactly. */
  cutRow: number;
  notes: { tone: 'good' | 'warn' | 'info'; text: string }[];
}

/** Works out where everything ends up for one height option, and what is worth knowing about it. */
export function optionFacts(l: Layout, o: HeightOption): OptionFacts {
  const underside = benchTop(l) + o.splash;
  const top = underside + o.upperH;
  const toCeiling = l.ceiling - top;
  const vsTall = top - l.tallH;
  const fullRows = l.tileH > 0 ? Math.floor((o.splash + 0.5) / l.tileH) : 0;
  const rest = l.tileH > 0 ? o.splash - fullRows * l.tileH : 0;
  const cutRow = rest < 1 ? 0 : Math.round(rest);
  const notes: OptionFacts['notes'] = [];

  if (l.tileH > 0) {
    if (cutRow === 0) notes.push({ tone: 'good', text: `Tiles: ${fullRows} full ${fullRows === 1 ? 'row' : 'rows'} of ${l.tileH} mm fit exactly. No cutting along the top.` });
    else if (fullRows === 0) notes.push({ tone: 'warn', text: `Tiles: every ${l.tileH} mm tile has to be cut down to ${cutRow} mm high.` });
    else notes.push({ tone: 'warn', text: `Tiles: ${fullRows} full ${fullRows === 1 ? 'row' : 'rows'} of ${l.tileH} mm, then a cut row ${cutRow} mm high along the top.` });
  }
  if (toCeiling < 0) notes.push({ tone: 'warn', text: `Does not fit: the cabinets would need ${Math.round(-toCeiling)} mm more height than the ceiling allows.` });
  else if (toCeiling < 5) notes.push({ tone: 'info', text: 'Cabinets reach the ceiling. Any cornice has to come off or be cut around.' });
  else if (toCeiling <= 80) notes.push({ tone: 'warn', text: `Leaves a ${Math.round(toCeiling)} mm strip under the ceiling. That needs a filler strip, and any cornice has to come off or be cut around.` });
  else notes.push({ tone: 'info', text: `Leaves ${Math.round(toCeiling)} mm open above the cabinets (a ledge that collects dust, unless it is boxed in).` });

  if (Math.abs(vsTall) < 3) notes.push({ tone: 'good', text: 'Cabinet tops line up with the pantry.' });
  else notes.push({ tone: 'info', text: `Cabinet tops sit ${Math.round(Math.abs(vsTall))} mm ${vsTall > 0 ? 'above' : 'below'} the top of the pantry (${l.tallH} mm), so there is a step where they meet.` });

  notes.push({ tone: 'info', text: `Underside of the cabinets is ${underside} mm from the floor; the highest shelf space reaches ${top} mm.` });
  return { underside, top, toCeiling, vsTall, fullRows, cutRow, notes };
}

const n = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
const s = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'object' && x !== null) : []);

/** Tidies a layout read from a file. */
export function normaliseLayout(raw: unknown): Layout | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const d = defaultLayout();
  const segs = (v: unknown): Segment[] =>
    arr(v).map((x) => ({ id: s(x.id) || newId(), kind: (s(x.kind) in KIND_NAMES ? s(x.kind) : 'cabinet') as SegKind, w: n(x.w, 600), label: s(x.label) }));
  const options = arr(r.options).map((o) => ({ id: s(o.id) || newId(), name: s(o.name, 'Option'), splash: n(o.splash, 600), upperH: n(o.upperH, 720) }));
  return {
    ceiling: n(r.ceiling, d.ceiling), toeKick: n(r.toeKick, d.toeKick), baseH: n(r.baseH, d.baseH), benchT: n(r.benchT, d.benchT),
    tallH: n(r.tallH, d.tallH), tileW: n(r.tileW, d.tileW), tileH: n(r.tileH, d.tileH),
    walls: arr(r.walls).map((w) => ({ id: s(w.id) || newId(), name: s(w.name, 'Wall'), base: segs(w.base), upper: segs(w.upper), hobW: n(w.hobW, 0) })),
    options,
    chosen: options.some((o) => o.id === r.chosen) ? s(r.chosen) : null,
  };
}
