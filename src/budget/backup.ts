// Saving the whole project (with its photos) to one file, and loading it back.
import { type Item, type Option, type Photo, type Project, type Section, type Version, newId } from './model';
import { photoBlob, storePhoto } from './store';
import { normaliseLayout } from './layout';

interface BackupFile {
  format: 'planbench-project';
  version: 1;
  project: Project;
  /** Photo id -> the picture as a data address. */
  photos: Record<string, string>;
}

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'object' && x !== null) : []);

/** Tidies a project read from a file, so a damaged or hand-edited file cannot break the app. */
export function normaliseProject(raw: unknown): Project {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as Project).sections)) {
    throw new Error('This file does not contain a Planbench project.');
  }
  const r = raw as Record<string, unknown>;
  const sections: Section[] = list(r.sections).map((s) => ({
    id: str(s.id) || newId(),
    name: str(s.name),
    items: list(s.items).map((i): Item => {
      const options: Option[] = list(i.options).map((o) => ({
        id: str(o.id) || newId(),
        name: str(o.name),
        supplier: str(o.supplier),
        price: num(o.price),
        labour: num(o.labour),
        extra: num(o.extra),
        link: str(o.link),
        notes: str(o.notes),
        ...(str(o.photoId) ? { photoId: str(o.photoId) } : {}),
        ...(/^#[0-9a-fA-F]{6}$/.test(str(o.swatch)) ? { swatch: str(o.swatch) } : {}),
      }));
      const chosen = options.some((o) => o.id === i.chosen) ? str(i.chosen) : null;
      return { id: str(i.id) || newId(), name: str(i.name), qty: num(i.qty, 1), unit: str(i.unit, 'each'), options, chosen, included: i.included !== false, notes: str(i.notes) };
    }),
  }));
  const versions: Version[] = list(r.versions).map((v) => {
    const picks: Version['picks'] = {};
    for (const [k, p] of Object.entries((v.picks ?? {}) as Record<string, Record<string, unknown>>)) {
      if (p && typeof p === 'object') picks[k] = { chosen: typeof p.chosen === 'string' ? p.chosen : null, included: p.included !== false, qty: num(p.qty, 1) };
    }
    return { id: str(v.id) || newId(), name: str(v.name, 'Version'), savedAt: str(v.savedAt), picks };
  });
  const photos: Photo[] = list(r.photos)
    .filter((p) => str(p.id))
    .map((p) => ({ id: str(p.id), group: p.group === 'ideas' ? 'ideas' : p.group === 'option' ? 'option' : 'now', caption: str(p.caption), addedAt: str(p.addedAt) }));
  return {
    id: str(r.id) || newId(),
    name: str(r.name, 'Our kitchen'),
    currency: /^[A-Z]{3}$/.test(str(r.currency)) ? str(r.currency) : 'NZD',
    gstPct: num(r.gstPct, 15),
    contingencyPct: num(r.contingencyPct, 10),
    sections,
    versions,
    photos,
    ...(normaliseLayout(r.layout) ? { layout: normaliseLayout(r.layout) } : {}),
  };
}

function photoIds(p: Project): string[] {
  const ids = p.photos.map((x) => x.id);
  for (const s of p.sections) for (const i of s.items) for (const o of i.options) if (o.photoId) ids.push(o.photoId);
  if (p.layout?.splashPhoto) ids.push(p.layout.splashPhoto);
  if (p.layout?.floorPhoto) ids.push(p.layout.floorPhoto);
  if (p.layout?.benchPhoto) ids.push(p.layout.benchPhoto);
  return [...new Set(ids)];
}

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

export async function exportBackup(p: Project): Promise<Blob> {
  const photos: Record<string, string> = {};
  for (const id of photoIds(p)) {
    const blob = await photoBlob(id).catch(() => undefined);
    if (blob) photos[id] = await toDataUrl(blob);
  }
  const file: BackupFile = { format: 'planbench-project', version: 1, project: p, photos };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

/** Reads a project file. Stores its photos on this device and returns the project. */
export async function importBackup(text: string): Promise<Project> {
  let file: Partial<BackupFile>;
  try {
    file = JSON.parse(text) as Partial<BackupFile>;
  } catch {
    throw new Error('This file could not be read. It does not look like a Planbench project file.');
  }
  if (file?.format !== 'planbench-project') throw new Error('This file does not contain a Planbench project.');
  const project = normaliseProject(file.project);
  const wanted = new Set(photoIds(project));
  for (const [id, url] of Object.entries(file.photos ?? {})) {
    if (!wanted.has(id) || typeof url !== 'string' || !url.startsWith('data:image/')) continue;
    try {
      await storePhoto(id, await (await fetch(url)).blob());
    } catch { /* a photo that will not load is skipped; the rest of the project still opens */ }
  }
  return project;
}
