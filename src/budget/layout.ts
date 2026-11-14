// A wall seen straight on (an "elevation"): base units along the floor, wall cabinets above,
// and a few height options to compare, such as how tall the splashback is.
import { newId } from './model';

export type SegKind = 'cabinet' | 'drawers' | 'sink' | 'oven' | 'dishwasher' | 'fridge' | 'tall' | 'hood' | 'open' | 'filler' | 'gap';

export const KIND_NAMES: Record<SegKind, string> = {
  cabinet: 'Cupboard', drawers: 'Drawers', sink: 'Sink cupboard', oven: 'Oven', dishwasher: 'Dishwasher', fridge: 'Fridge',
  tall: 'Tall unit / pantry', hood: 'Rangehood cabinet', open: 'Open shelf', filler: 'Filler panel', gap: 'Empty space',
};

export interface Segment {
  id: string;
  kind: SegKind;
  /** Width in millimetres. */
  w: number;
  label: string;
  /** For a wall unit that does not sit with the others (such as a box over the fridge): its bottom and top, from the floor. */
  lo?: number;
  hi?: number;
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
  /** Where this wall sits in the room, seen from above: the left-hand end of the run as you face it. */
  x: number;
  y: number;
  /** Which way the run heads from there, seen from above: 0 = right, 90 = down, 180 = left, 270 = up. */
  dir: number;
  /** A window in this wall: distance from the left end, width, height of the sill from the floor, and height. */
  window?: { from: number; w: number; sill: number; h: number };
}

/** A patch of floor: the kitchen and dining tiles, the lounge carpet, the deck. Seen from above. */
export interface Zone {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  d: number;
  floor: 'tile' | 'carpet' | 'deck' | 'plain';
}

export interface Opening {
  kind: 'window' | 'slider' | 'door';
  /** Distance along the wall from its first end, width, height of the sill from the floor, and height. */
  from: number;
  w: number;
  sill: number;
  h: number;
  /** For a door: draw it shut, with its leaf in place. */
  closed?: boolean;
}

/** A wall of the room, seen from above, from one end to the other. */
export interface RoomWall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Outside walls are hidden when you look in from behind them. */
  outer: boolean;
  openings: Opening[];
}

export type ItemKind = 'table' | 'rug' | 'sofa' | 'box';
export const ITEM_NAMES: Record<ItemKind, string> = { table: 'Table', rug: 'Rug', sofa: 'Sofa', box: 'Other furniture' };

/** A piece of furniture. x and y are its centre, seen from above. */
export interface Furniture {
  id: string;
  name: string;
  kind: ItemKind;
  x: number;
  y: number;
  /** Length, width and height. */
  w: number;
  d: number;
  h: number;
  /** Turned by this many degrees. */
  rot: number;
  color: string;
  /** For tables: how many chairs to draw around it. */
  chairs: number;
  /** How far off the floor it sits, for things fixed to a wall such as a television. */
  lift: number;
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
  /** Floor tile size, and photos to use as the tile surfaces in the 3D view. */
  floorTileW: number;
  floorTileH: number;
  /** A photo of one repeat of the splashback pattern, and how big that repeat is in real life. */
  splashPhoto?: string;
  splashRepeat: number;
  /** A photo of one whole floor tile. */
  floorPhoto?: string;
  /** A close-up photo of the benchtop surface, and the real width in millimetres of the patch it shows. */
  benchPhoto?: string;
  benchRepeat: number;
  /** A colour to wash over the wall tiles in the 3D view, and how strongly (0 to 100), to match how they look in real life. */
  splashTint: string;
  splashTintPct: number;
  /** The rest of the room: floors, walls and furniture. Empty when only the kitchen runs are drawn. */
  zones: Zone[];
  roomWalls: RoomWall[];
  items: Furniture[];
  /** The fridge's real size, so it can be drawn standing proud of the cabinets. */
  fridgeW: number;
  fridgeD: number;
  fridgeH: number;
  /** How the fridge's doors are split, and its colour. */
  fridgeDoors: 'french' | 'quad';
  fridgeColor: string;
  /** Real sizes and finishes of the other appliances, so they are drawn as the ones actually bought. */
  dishColor: string;
  ovenH: number;
  hobD: number;
  hobZones: number;
  hoodW: number;
  hoodD: number;
}

export const seg = (kind: SegKind, w: number, label = ''): Segment => ({ id: newId(), kind, w, label });

export function defaultLayout(): Layout {
  return {
    ceiling: 2400, toeKick: 150, baseH: 720, benchT: 30, tallH: 2086, tileW: 600, tileH: 300,
    walls: [{
      id: newId(), name: 'Cooktop wall', hobW: 600, x: 0, y: 0, dir: 0,
      base: [seg('cabinet', 600), seg('drawers', 600), seg('oven', 600), seg('cabinet', 600), seg('cabinet', 600)],
      upper: [seg('cabinet', 600), seg('cabinet', 600), seg('hood', 600), seg('cabinet', 600), seg('cabinet', 600)],
    }],
    options: [{ id: newId(), name: 'Standard', splash: 600, upperH: 720 }],
    chosen: null,
    floorTileW: 600, floorTileH: 600, splashRepeat: 0, benchRepeat: 0, splashTint: '#f6f0e3', splashTintPct: 0,
    zones: [], roomWalls: [], items: [], fridgeW: 0, fridgeD: 690, fridgeH: 1790, fridgeDoors: 'french', fridgeColor: '#aeb4ba',
    dishColor: '#aeb4ba', ovenH: 598, hobD: 510, hobZones: 4, hoodW: 0, hoodD: 290,
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
  // Tile sizes are nominal: a few millimetres either way disappear into the grout lines and the sealant along the bench.
  const SLACK = 6;
  const fullRows = l.tileH > 0 ? Math.floor((o.splash + SLACK) / l.tileH) : 0;
  const rest = l.tileH > 0 ? o.splash - fullRows * l.tileH : 0;
  const cutRow = rest <= SLACK ? 0 : Math.round(rest);
  const notes: OptionFacts['notes'] = [];

  if (l.tileH > 0) {
    const rows = `${fullRows} full ${fullRows === 1 ? 'row' : 'rows'} of ${l.tileH} mm`;
    if (cutRow === 0 && Math.abs(rest) < 0.5) notes.push({ tone: 'good', text: `Tiles: ${rows} fit exactly. No cutting along the top.` });
    else if (cutRow === 0 && rest > 0) notes.push({ tone: 'good', text: `Tiles: ${rows} fit with ${Math.round(rest)} mm to spare, which the grout lines take up. No cutting along the top.` });
    else if (cutRow === 0) notes.push({ tone: 'info', text: `Tiles: ${rows} only just fit; it is ${Math.round(-rest)} mm tight. Check the exact tile and grout size with the tiler.` });
    else if (fullRows === 0) notes.push({ tone: 'warn', text: `Tiles: every ${l.tileH} mm tile has to be cut down to ${cutRow} mm high.` });
    else notes.push({ tone: 'warn', text: `Tiles: ${rows}, then a cut row ${cutRow} mm high along the top.` });
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
    arr(v).map((x) => ({
      id: s(x.id) || newId(), kind: (s(x.kind) in KIND_NAMES ? s(x.kind) : 'cabinet') as SegKind, w: n(x.w, 600), label: s(x.label),
      ...(typeof x.lo === 'number' && typeof x.hi === 'number' && x.hi > x.lo ? { lo: n(x.lo, 0), hi: n(x.hi, 0) } : {}),
    }));
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);
  const options = arr(r.options).map((o) => ({ id: s(o.id) || newId(), name: s(o.name, 'Option'), splash: n(o.splash, 600), upperH: n(o.upperH, 720) }));
  return {
    ceiling: n(r.ceiling, d.ceiling), toeKick: n(r.toeKick, d.toeKick), baseH: n(r.baseH, d.baseH), benchT: n(r.benchT, d.benchT),
    tallH: n(r.tallH, d.tallH), tileW: n(r.tileW, d.tileW), tileH: n(r.tileH, d.tileH),
    walls: arr(r.walls).map((w) => {
      const win = w.window as Record<string, unknown> | undefined;
      return {
        id: s(w.id) || newId(), name: s(w.name, 'Wall'), base: segs(w.base), upper: segs(w.upper), hobW: n(w.hobW, 0),
        x: typeof w.x === 'number' && Number.isFinite(w.x) ? w.x : 0,
        y: typeof w.y === 'number' && Number.isFinite(w.y) ? w.y : 0,
        dir: [0, 90, 180, 270].includes(w.dir as number) ? (w.dir as number) : 0,
        ...(win && typeof win === 'object' ? { window: { from: n(win.from, 0), w: n(win.w, 1000), sill: n(win.sill, 1000), h: n(win.h, 1000) } } : {}),
      };
    }),
    options,
    chosen: options.some((o) => o.id === r.chosen) ? s(r.chosen) : null,
    floorTileW: n(r.floorTileW, 600), floorTileH: n(r.floorTileH, 600), splashRepeat: n(r.splashRepeat, 0),
    ...(s(r.splashPhoto) ? { splashPhoto: s(r.splashPhoto) } : {}),
    ...(s(r.floorPhoto) ? { floorPhoto: s(r.floorPhoto) } : {}),
    benchRepeat: n(r.benchRepeat, 0),
    splashTint: /^#[0-9a-fA-F]{6}$/.test(s(r.splashTint)) ? s(r.splashTint) : '#f6f0e3',
    splashTintPct: Math.min(100, n(r.splashTintPct, 0)),
    zones: arr(r.zones).map((z) => ({ id: s(z.id) || newId(), name: s(z.name, 'Area'), x: num(z.x, 0), y: num(z.y, 0), w: n(z.w, 3000), d: n(z.d, 3000), floor: pick(z.floor, ['tile', 'carpet', 'deck', 'plain'] as const, 'plain') })),
    roomWalls: arr(r.roomWalls).map((w) => ({
      id: s(w.id) || newId(), x1: num(w.x1, 0), y1: num(w.y1, 0), x2: num(w.x2, 0), y2: num(w.y2, 0), outer: w.outer !== false,
      openings: arr(w.openings).map((o) => ({ kind: pick(o.kind, ['window', 'slider', 'door'] as const, 'window'), from: n(o.from, 0), w: n(o.w, 900), sill: n(o.sill, 0), h: n(o.h, 2000), ...(o.closed === true ? { closed: true } : {}) })),
    })),
    items: arr(r.items).map((i) => ({
      id: s(i.id) || newId(), name: s(i.name, 'Furniture'), kind: pick(i.kind, ['table', 'rug', 'sofa', 'box'] as const, 'box'),
      x: num(i.x, 0), y: num(i.y, 0), w: n(i.w, 1000), d: n(i.d, 600), h: n(i.h, 700), rot: num(i.rot, 0),
      color: /^#[0-9a-fA-F]{6}$/.test(s(i.color)) ? s(i.color) : '#9a6a3c', chairs: Math.min(12, n(i.chairs, 0)), lift: n(i.lift, 0),
    })),
    fridgeW: n(r.fridgeW, 0), fridgeD: n(r.fridgeD, 690), fridgeH: n(r.fridgeH, 1790),
    fridgeDoors: r.fridgeDoors === 'quad' ? 'quad' : 'french',
    fridgeColor: /^#[0-9a-fA-F]{6}$/.test(s(r.fridgeColor)) ? s(r.fridgeColor) : '#aeb4ba',
    dishColor: /^#[0-9a-fA-F]{6}$/.test(s(r.dishColor)) ? s(r.dishColor) : '#aeb4ba',
    ovenH: n(r.ovenH, 598), hobD: n(r.hobD, 510), hobZones: Math.min(6, n(r.hobZones, 4)), hoodW: n(r.hoodW, 0), hoodD: n(r.hoodD, 290),
    ...(s(r.benchPhoto) ? { benchPhoto: s(r.benchPhoto) } : {}),
  };
}

export interface FitNote {
  tone: 'good' | 'warn' | 'info';
  text: string;
}

/** How well the fridge fits the space the kitchen design leaves for it. */
export function fridgeFit(l: Layout): FitNote[] {
  const notes: FitNote[] = [];
  for (const w of l.walls) {
    let at = 0;
    for (const s of w.base) {
      if (s.kind === 'fridge' && l.fridgeW > 0) {
        const spare = s.w - l.fridgeW;
        if (spare < 0) notes.push({ tone: 'warn', text: `Too wide: the fridge is ${l.fridgeW} mm and the space is ${s.w} mm, so it is ${Math.round(-spare)} mm too big.` });
        else notes.push({ tone: spare < 20 ? 'warn' : 'good', text: `Width: ${l.fridgeW} mm fridge in a ${s.w} mm space leaves ${Math.round(spare)} mm spare (${Math.round(spare / 2)} mm each side). Check the maker's minimum air gap.` });
        // Anything hung on the wall above the fridge's position.
        let ua = 0;
        let above = Infinity;
        for (const u of w.upper) {
          if (u.kind !== 'gap' && u.lo !== undefined && ua < at + s.w && ua + u.w > at) above = Math.min(above, u.lo);
          ua += u.w;
        }
        if (above < Infinity) {
          const gap = above - l.fridgeH;
          if (gap < 0) notes.push({ tone: 'warn', text: `Too tall: the fridge is ${l.fridgeH} mm high and the unit above starts at ${above} mm, so it is ${Math.round(-gap)} mm too tall.` });
          else notes.push({ tone: gap < 25 ? 'warn' : 'good', text: `Height: ${l.fridgeH} mm fridge under a unit at ${above} mm leaves ${Math.round(gap)} mm above it.` });
        }
        const proud = l.fridgeD - 585;
        notes.push({ tone: 'info', text: proud > 0 ? `Depth: ${l.fridgeD} mm deep, so it stands ${Math.round(proud)} mm in front of the 585 mm cabinets (plus handles).` : `Depth: ${l.fridgeD} mm deep, which sits flush with or behind the 585 mm cabinet fronts.` });
      }
      at += s.w;
    }
  }
  return notes;
}
