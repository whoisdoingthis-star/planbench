// Where the project is kept. For now this is the browser on this device:
// the budget in local storage, photos in the browser's database.
// Everything goes through this file so that shared online saving can replace it later.
import { type Project, kitchenTemplate } from './model';

const KEY = 'planbench.project.v1';

export function loadProject(): Project {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Project;
      if (p && Array.isArray(p.sections)) {
        p.versions ??= [];
        p.photos ??= [];
        return p;
      }
    }
  } catch { /* fall through to a fresh project */ }
  return kitchenTemplate();
}

export function saveProject(p: Project): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- photos

/** Set once the app has signed in, so photos are also sent to and fetched from the shared project. */
export const photoCloud: {
  queue?: (ids: string[]) => void;
  download?: (id: string) => Promise<Blob | null>;
  remove?: (id: string) => Promise<void>;
} = {};

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('planbench', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('photos');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = run(d.transaction('photos', mode).objectStore('photos'));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Shrinks a photo to a sensible size (phone photos are huge) and stores it. */
export async function storePhoto(id: string, file: Blob): Promise<void> {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  if (!blob) throw new Error('The photo could not be saved.');
  await tx('readwrite', (s) => s.put(blob, id));
  urls.delete(id);
  photoCloud.queue?.([id]);
}

export async function photoBlob(id: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>('readonly', (s) => s.get(id));
}

export async function deletePhoto(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
  void photoCloud.remove?.(id);
  const u = urls.get(id);
  if (u) URL.revokeObjectURL(u);
  urls.delete(id);
}

const urls = new Map<string, string>();

/** An address the browser can show in an <img>, or null if the photo is missing. */
export async function photoUrl(id: string): Promise<string | null> {
  const have = urls.get(id);
  if (have) return have;
  try {
    let blob = await photoBlob(id);
    if (!blob) {
      // Not on this device yet: it may have been added on another one.
      const fetched = await photoCloud.download?.(id);
      if (!fetched) return null;
      blob = fetched;
      await tx('readwrite', (s) => s.put(fetched, id));
    }
    const u = URL.createObjectURL(blob);
    urls.set(id, u);
    return u;
  } catch {
    return null;
  }
}
