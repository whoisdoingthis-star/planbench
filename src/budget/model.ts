// The renovation budget: sections (Cabinetry, Tiles...), items in each section, and
// several candidate options per item. All the sums live here, away from the screen code.

export interface Option {
  id: string;
  name: string;
  supplier: string;
  /** Price for one unit (one handle, one square metre of tile, one hour...). */
  price: number;
  /** Fitting or labour cost for one unit, if it is charged that way. */
  labour: number;
  /** A one-off amount on top, such as delivery or a call-out fee. */
  extra: number;
  link: string;
  notes: string;
  photoId?: string;
  /** The colour to draw this option in on the 3D view, e.g. "#f4f4f1". */
  swatch?: string;
  /** Its real size in millimetres (width, depth, height), for things whose size affects the layout, such as a fridge. */
  size?: { w: number; d: number; h: number };
}

export interface Item {
  id: string;
  name: string;
  qty: number;
  unit: string;
  options: Option[];
  /** Which option is currently picked, or null while undecided. */
  chosen: string | null;
  /** False when you have decided to leave this item out altogether. */
  included: boolean;
  notes: string;
}

export interface Section {
  id: string;
  name: string;
  items: Item[];
}

export interface Pick {
  chosen: string | null;
  included: boolean;
  qty: number;
}

/** A saved set of choices, e.g. "Budget" or "Dream", to compare against others. */
export interface Version {
  id: string;
  name: string;
  savedAt: string;
  picks: Record<string, Pick>;
}

export interface Photo {
  id: string;
  group: 'now' | 'ideas' | 'option';
  caption: string;
  addedAt: string;
}

export interface Project {
  id: string;
  name: string;
  currency: string;
  /** GST / VAT rate in percent. Prices are typed including it. */
  gstPct: number;
  /** Extra allowance for surprises, in percent. */
  contingencyPct: number;
  sections: Section[];
  versions: Version[];
  photos: Photo[];
  /** Wall views and height options. Absent until the Layout screen is first used. */
  layout?: import('./layout').Layout;
}

export const UNITS = ['each', 'm', 'm²', 'hours', 'job'];

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

const cents = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100);

/** What one option would cost for a given quantity, in dollars. */
export function optionCost(opt: Option, qty: number): number {
  return (Math.round(cents(opt.price + opt.labour) * (Number.isFinite(qty) ? qty : 0)) + cents(opt.extra)) / 100;
}

export function chosenOption(item: Item, pick?: Pick): Option | null {
  const id = pick ? pick.chosen : item.chosen;
  return item.options.find((o) => o.id === id) ?? null;
}

/** What this item adds to the total with the current (or a saved) choice. */
export function itemCost(item: Item, pick?: Pick): number {
  const included = pick ? pick.included : item.included;
  const opt = chosenOption(item, pick);
  if (!included || !opt) return 0;
  return optionCost(opt, pick ? pick.qty : item.qty);
}

export interface Totals {
  sections: { id: string; name: string; total: number }[];
  subtotal: number;
  contingency: number;
  total: number;
  /** The GST already inside the total. */
  gst: number;
  /** Items that are included but have no option picked yet. */
  undecided: number;
  /** The cheapest and dearest the included items could come to, across all their options. */
  low: number;
  high: number;
}

export function totals(p: Project, picks?: Record<string, Pick>): Totals {
  let subtotalC = 0;
  let lowC = 0;
  let highC = 0;
  let undecided = 0;
  const sections = p.sections.map((s) => {
    let c = 0;
    for (const item of s.items) {
      // An item added after a version was saved is not part of that version.
      const pick = picks ? picks[item.id] ?? { chosen: null, included: false, qty: item.qty } : undefined;
      c += cents(itemCost(item, pick));
      const included = pick ? pick.included : item.included;
      if (!included) continue;
      if (!chosenOption(item, pick)) undecided++;
      const qty = pick ? pick.qty : item.qty;
      const costs = item.options.map((o) => cents(optionCost(o, qty)));
      if (costs.length) {
        lowC += Math.min(...costs);
        highC += Math.max(...costs);
      }
    }
    subtotalC += c;
    return { id: s.id, name: s.name, total: c / 100 };
  });
  const contingencyC = Math.round((subtotalC * (p.contingencyPct || 0)) / 100);
  const totalC = subtotalC + contingencyC;
  const gstC = Math.round((totalC * (p.gstPct || 0)) / (100 + (p.gstPct || 0)));
  return {
    sections,
    subtotal: subtotalC / 100,
    contingency: contingencyC / 100,
    total: totalC / 100,
    gst: gstC / 100,
    undecided,
    low: lowC / 100,
    high: highC / 100,
  };
}

export function snapshot(p: Project): Record<string, Pick> {
  const picks: Record<string, Pick> = {};
  for (const s of p.sections) for (const i of s.items) picks[i.id] = { chosen: i.chosen, included: i.included, qty: i.qty };
  return picks;
}

export function saveVersion(p: Project, name: string): Version {
  const v: Version = { id: newId(), name: name.trim() || `Version ${p.versions.length + 1}`, savedAt: new Date().toISOString(), picks: snapshot(p) };
  p.versions.push(v);
  return v;
}

/** Puts a saved version's choices back as the current choices. */
export function applyVersion(p: Project, v: Version): void {
  for (const s of p.sections) {
    for (const i of s.items) {
      const pick = v.picks[i.id];
      if (!pick) continue;
      i.included = pick.included;
      i.qty = pick.qty;
      i.chosen = i.options.some((o) => o.id === pick.chosen) ? pick.chosen : null;
    }
  }
}

export function newOption(name = ''): Option {
  return { id: newId(), name, supplier: '', price: 0, labour: 0, extra: 0, link: '', notes: '' };
}

export function newItem(name = '', unit = 'each'): Item {
  return { id: newId(), name, qty: 1, unit, options: [], chosen: null, included: true, notes: '' };
}

const TEMPLATE: [string, [string, string][]][] = [
  ['Demolition & preparation', [['Remove the old kitchen', 'job'], ['Skip / rubbish removal', 'each']]],
  ['Cabinetry', [['Base cabinets', 'm'], ['Wall cabinets', 'm'], ['Pantry / tall units', 'each'], ['Cabinet installation', 'job']]],
  ['Handles & hardware', [['Cupboard handles', 'each'], ['Soft-close hinges & drawer runners', 'each']]],
  ['Benchtops', [['Benchtop', 'm'], ['Cut-outs & edging', 'job']]],
  ['Splashback & tiles', [['Splashback tiles', 'm²'], ['Tiler', 'm²'], ['Grout, adhesive & trim', 'job']]],
  ['Flooring', [['Flooring', 'm²'], ['Floor laying', 'm²']]],
  ['Appliances', [['Oven', 'each'], ['Cooktop', 'each'], ['Rangehood', 'each'], ['Dishwasher', 'each'], ['Fridge', 'each']]],
  ['Sink & plumbing', [['Sink', 'each'], ['Tap', 'each'], ['Plumber', 'hours']]],
  ['Electrical & lighting', [['Electrician', 'hours'], ['Power points', 'each'], ['Light fittings', 'each']]],
  ['Walls & paint', [['Plastering', 'job'], ['Painting', 'job']]],
  ['Design & consents', [['Kitchen design / drawings', 'job'], ['Council consent (if needed)', 'job']]],
];

/** A new kitchen project with the usual lines already listed, ready for prices. */
export function kitchenTemplate(): Project {
  return {
    id: newId(),
    name: 'Our kitchen',
    currency: 'NZD',
    gstPct: 15,
    contingencyPct: 10,
    sections: TEMPLATE.map(([name, items]) => ({ id: newId(), name, items: items.map(([n, u]) => newItem(n, u)) })),
    versions: [],
    photos: [],
  };
}

export function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The budget as a spreadsheet file (CSV), one row per item. */
export function toCsv(p: Project): string {
  const rows: (string | number)[][] = [['Section', 'Item', 'Quantity', 'Unit', 'Chosen option', 'Supplier', 'Price per unit', 'Fitting per unit', 'One-off extra', 'Line total', 'Notes']];
  for (const s of p.sections) {
    for (const i of s.items) {
      const o = chosenOption(i);
      const status = !i.included ? '(left out)' : o ? o.name : '(not decided)';
      rows.push([s.name, i.name, i.qty, i.unit, status, o?.supplier ?? '', o?.price ?? '', o?.labour ?? '', o?.extra ?? '', itemCost(i).toFixed(2), i.notes]);
    }
  }
  const t = totals(p);
  rows.push([], ['', '', '', '', '', '', '', '', 'Subtotal', t.subtotal.toFixed(2)]);
  rows.push(['', '', '', '', '', '', '', '', `Allowance for surprises (${p.contingencyPct}%)`, t.contingency.toFixed(2)]);
  rows.push(['', '', '', '', '', '', '', '', 'Total', t.total.toFixed(2)]);
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Swaps everything inside the app's project for another project, keeping the same object. */
export function replaceProject(target: Project, next: Project): void {
  const t = target as unknown as Record<string, unknown>;
  for (const k of Object.keys(t)) delete t[k];
  Object.assign(t, JSON.parse(JSON.stringify(next)));
  target.versions ??= [];
  target.photos ??= [];
}
